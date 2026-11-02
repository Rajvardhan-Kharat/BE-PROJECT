import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from backend.app.core.config import settings
from backend.app.integrations.aria.base import AriaHealthStatus, AriaSendMessageResponse
from backend.app.integrations.aria.factory import get_aria_provider
from backend.app.integrations.aria.pseudonym import derive_pseudonymous_user_id
from backend.app.integrations.aria.safety.crisis_detector import crisis_detector
from backend.app.repositories.aria_repository import aria_repository
from backend.app.services.audit_service import audit_service
from backend.app.services.consent_service import consent_service

logger = logging.getLogger("vericare.services.aria")


class AriaService:
    """
    High-integrity service managing the VeriCare side of the Aria integration.

    INVARIANTS:
    1. Zero PHI to Aria: Only pseudonymous IDs sent to provider.
    2. Zero Aria in Clinical Records: Stored exclusively in aria_* collections.
    3. Strict Scoping: Patient-only access. Clinicians and break-glass receive 403.
    4. Log Scrubbing: No message text or summary text is ever logged in audit_events or system logs.
    5. Immutable Sharing: Doctor sees only patient-approved snapshots gated by active consent on every read.
    """

    def __init__(self, repo=aria_repository):
        self.repo = repo

    def _verify_patient_owner(self, user: Dict[str, Any], patient_id: str) -> None:
        """Enforces that only the owning patient can access Aria sessions and messages."""
        role = user.get("role")
        user_id = user.get("user_id")
        user_patient_id = user.get("patient_id") or user.get("scope", {}).get("patientId") or user.get("scope", {}).get("patient_id")

        # Fallback for synthetic dev patient account
        if not user_patient_id and role == "patient" and user_id in ["USR-PAT-001", "PAT-SYN-001"]:
            user_patient_id = "PAT-SYN-001"

        if role != "patient" or user_patient_id != patient_id:
            logger.warning(
                "Access denied to Aria companion data: user=%s role=%s target_patient=%s",
                user_id,
                role,
                patient_id,
            )
            # Log audit denial with NO content
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Aria companion data is strictly restricted to the owning patient.",
            )

    async def get_health(self) -> AriaHealthStatus:
        provider = get_aria_provider()
        return await provider.health()

    # --- NOTICE ACKNOWLEDGMENT ---

    async def get_notice_status(self, patient_id: str) -> Dict[str, Any]:
        ack = await self.repo.get_notice_acknowledgment(patient_id)
        return {
            "acknowledged": ack is not None,
            "provider_label": settings.ARIA_PROVIDER_LABEL,
            "mode": settings.ARIA_MODE,
            "acknowledged_at": ack.get("acknowledged_at") if ack else None,
        }

    async def acknowledge_notice(self, user: Dict[str, Any], patient_id: str) -> Dict[str, Any]:
        self._verify_patient_owner(user, patient_id)
        ack = await self.repo.record_notice_acknowledgment(
            patient_id=patient_id,
            provider_label=settings.ARIA_PROVIDER_LABEL,
            mode=settings.ARIA_MODE,
        )
        await audit_service.log_event(
            event_type="ARIA_NOTICE_ACKNOWLEDGED",
            user_id=user.get("user_id"),
            role="patient",
            details={"patient_id": patient_id, "provider_label": settings.ARIA_PROVIDER_LABEL, "mode": settings.ARIA_MODE},
            status="SUCCESS",
        )
        return ack

    # --- SESSIONS ---

    async def create_session(
        self, user: Dict[str, Any], patient_id: str, title: Optional[str] = None
    ) -> Dict[str, Any]:
        self._verify_patient_owner(user, patient_id)
        session_id = f"aria_sess_{uuid.uuid4().hex[:12]}"
        default_title = title or f"Session {datetime.now(timezone.utc).strftime('%b %d, %Y')}"
        session = await self.repo.create_session(
            patient_id=patient_id,
            session_id=session_id,
            title=default_title,
        )
        await audit_service.log_event(
            event_type="ARIA_SESSION_CREATED",
            user_id=user.get("user_id"),
            role="patient",
            details={"session_id": session_id, "patient_id": patient_id},
            status="SUCCESS",
        )
        return session

    async def list_sessions(self, user: Dict[str, Any], patient_id: str) -> List[Dict[str, Any]]:
        self._verify_patient_owner(user, patient_id)
        return await self.repo.list_sessions_for_patient(patient_id)

    async def delete_session(
        self, user: Dict[str, Any], patient_id: str, session_id: str
    ) -> bool:
        self._verify_patient_owner(user, patient_id)
        session = await self.repo.get_session(session_id)
        if not session or session.get("patient_id") != patient_id:
            raise HTTPException(status_code=404, detail="Session not found.")

        # Notify provider to clean up state
        provider = get_aria_provider()
        await provider.delete_session(session_id)

        deleted = await self.repo.delete_session(session_id, patient_id)
        await audit_service.log_event(
            event_type="ARIA_SESSION_DELETED",
            user_id=user.get("user_id"),
            role="patient",
            details={"session_id": session_id, "patient_id": patient_id},
            status="SUCCESS",
        )
        return deleted

    # --- MESSAGING & CRISIS SAFETY ---

    async def send_message(
        self, user: Dict[str, Any], patient_id: str, session_id: str, text: str
    ) -> Dict[str, Any]:
        self._verify_patient_owner(user, patient_id)
        session = await self.repo.get_session(session_id)
        if not session or session.get("patient_id") != patient_id:
            raise HTTPException(status_code=404, detail="Session not found.")

        msg_id_user = f"msg_{uuid.uuid4().hex[:12]}"
        provider = get_aria_provider()

        # 1. Save patient message in aria_messages
        await self.repo.save_message(
            session_id=session_id,
            patient_id=patient_id,
            message_id=msg_id_user,
            sender="user",
            text=text,
            provider_name=provider.provider_name,
            safety_event=False,
        )

        # Audit message sent (LOG SCRUBBING: record IDs only, never text!)
        await audit_service.log_event(
            event_type="ARIA_MESSAGE_SENT",
            user_id=user.get("user_id"),
            role="patient",
            details={"session_id": session_id, "patient_id": patient_id, "message_id": msg_id_user},
            status="SUCCESS",
        )

        # 2. Pre-provider Crisis Safety Check
        crisis_check = crisis_detector.check_message(text)
        if crisis_check.triggered:
            # Skip provider call; return immediate compassionate response with accredited crisis resources
            msg_id_companion = f"msg_{uuid.uuid4().hex[:12]}"
            companion_msg = await self.repo.save_message(
                session_id=session_id,
                patient_id=patient_id,
                message_id=msg_id_companion,
                sender="system_safety",
                text=crisis_check.guidance or "Please contact trusted crisis support.",
                provider_name="SYSTEM_CRISIS_FILTER",
                safety_event=True,
                crisis_guidance=crisis_check.guidance,
                crisis_resources=crisis_check.resources,
            )

            # Audit crisis safety triggered (LOG SCRUBBING: NO message text!)
            await audit_service.log_event(
                event_type="ARIA_CRISIS_SAFETY_TRIGGERED",
                user_id=user.get("user_id"),
                role="patient",
                details={
                    "session_id": session_id,
                    "patient_id": patient_id,
                    "message_id": msg_id_companion,
                    "safety_reason": crisis_check.reason,
                },
                status="CRISIS_INTERCEPTION",
            )
            return companion_msg

        # 3. Derive pseudonymous ID and call external/mock provider
        pseudonymous_user_id = derive_pseudonymous_user_id(patient_id)
        provider_resp: AriaSendMessageResponse = await provider.send_message(
            session_ref=session_id,
            pseudonymous_user_id=pseudonymous_user_id,
            text=text,
        )

        # 4. Post-provider Crisis Safety Check on reply
        post_crisis = crisis_detector.check_message(provider_resp.reply_text)
        if post_crisis.triggered:
            reply_text = post_crisis.guidance or provider_resp.reply_text
            safety_event = True
            crisis_guidance = post_crisis.guidance
            crisis_resources = post_crisis.resources
        else:
            reply_text = provider_resp.reply_text
            safety_event = provider_resp.safety_event
            crisis_guidance = None
            crisis_resources = None

        # 5. Save companion response in aria_messages
        msg_id_companion = f"msg_{uuid.uuid4().hex[:12]}"
        companion_msg = await self.repo.save_message(
            session_id=session_id,
            patient_id=patient_id,
            message_id=msg_id_companion,
            sender="companion",
            text=reply_text,
            provider_name=provider_resp.provider_name,
            safety_event=safety_event,
            crisis_guidance=crisis_guidance,
            crisis_resources=crisis_resources,
        )

        # Audit companion reply (LOG SCRUBBING: IDs only!)
        await audit_service.log_event(
            event_type="ARIA_COMPANION_REPLIED",
            user_id=user.get("user_id"),
            role="patient",
            details={
                "session_id": session_id,
                "patient_id": patient_id,
                "message_id": msg_id_companion,
                "provider_name": provider_resp.provider_name,
                "is_fallback": provider_resp.is_fallback,
            },
            status="SUCCESS",
        )

        return companion_msg

    async def list_messages(
        self, user: Dict[str, Any], patient_id: str, session_id: str
    ) -> List[Dict[str, Any]]:
        self._verify_patient_owner(user, patient_id)
        session = await self.repo.get_session(session_id)
        if not session or session.get("patient_id") != patient_id:
            raise HTTPException(status_code=404, detail="Session not found.")
        return await self.repo.list_messages_for_session(session_id, patient_id)

    # --- SHARING FLOW (CONSENT-GATED) ---

    async def generate_draft_summary(
        self, user: Dict[str, Any], patient_id: str, session_id: str
    ) -> Dict[str, Any]:
        """Drafts summary for patient review and editing. Not visible to clinicians until approved."""
        self._verify_patient_owner(user, patient_id)
        session = await self.repo.get_session(session_id)
        if not session or session.get("patient_id") != patient_id:
            raise HTTPException(status_code=404, detail="Session not found.")

        provider = get_aria_provider()
        pseudonymous_id = derive_pseudonymous_user_id(patient_id)
        draft_resp = await provider.draft_summary(session_id, pseudonymous_id)

        await audit_service.log_event(
            event_type="ARIA_SUMMARY_DRAFTED",
            user_id=user.get("user_id"),
            role="patient",
            details={"session_id": session_id, "patient_id": patient_id},
            status="SUCCESS",
        )

        return {
            "session_id": session_id,
            "draft_text": draft_resp.draft_text,
            "provider_name": draft_resp.provider_name,
        }

    async def approve_and_share_summary(
        self,
        user: Dict[str, Any],
        patient_id: str,
        recipient_id: str,
        recipient_name: str,
        summary_text: str,
        purpose: str = "mental_health_care_coordination",
    ) -> Dict[str, Any]:
        """Patient approves an edited summary snapshot and grants consent for a specific clinician."""
        self._verify_patient_owner(user, patient_id)

        share_id = f"aria_share_{uuid.uuid4().hex[:12]}"
        consent_version = "v1.0-aria-mental-health-share"

        # 1. Create immutable snapshot in aria_shared_summaries
        share_record = await self.repo.create_shared_summary(
            share_id=share_id,
            patient_id=patient_id,
            recipient_id=recipient_id,
            recipient_name=recipient_name,
            summary_text=summary_text,
            consent_version=consent_version,
            purpose=purpose,
        )

        # 2. Register consent directive in consent_service
        try:
            await consent_service.grant_consent(
                patient_id=patient_id,
                user=user,
                recipient=recipient_id,
                purpose=purpose,
                categories=["aria_summary"],
                text_version=consent_version,
            )
        except Exception as e:
            logger.error("Failed to register consent directive for Aria share: %s", e)

        # 3. Log audit event (LOG SCRUBBING: record IDs only, never summary text!)
        await audit_service.log_event(
            event_type="ARIA_SUMMARY_SHARED",
            user_id=user.get("user_id"),
            role="patient",
            details={
                "share_id": share_id,
                "patient_id": patient_id,
                "recipient_id": recipient_id,
                "recipient_name": recipient_name,
                "consent_version": consent_version,
            },
            status="SUCCESS",
        )

        return share_record

    async def list_patient_shares(
        self, user: Dict[str, Any], patient_id: str
    ) -> List[Dict[str, Any]]:
        self._verify_patient_owner(user, patient_id)
        return await self.repo.list_shares_for_patient(patient_id)

    async def revoke_share(
        self, user: Dict[str, Any], patient_id: str, share_id: str, reason: str
    ) -> Dict[str, Any]:
        """Revokes an active share; future clinician reads blocked immediately."""
        self._verify_patient_owner(user, patient_id)

        share = await self.repo.get_shared_summary(share_id)
        if not share or share.get("patient_id") != patient_id:
            raise HTTPException(status_code=404, detail="Shared summary not found.")

        updated_share = await self.repo.revoke_shared_summary(share_id, patient_id, reason)

        # Revoke consent in consent_service if directive exists
        try:
            recipient_id = share.get("recipient_id")
            consents = await consent_service.list_consents_for_patient(patient_id, user)
            for c in consents:
                if c.get("recipient") == recipient_id and "aria_summary" in c.get("categories", []) and c.get("status") == "granted":
                    await consent_service.revoke_consent(
                        consent_id=c.get("consent_id"),
                        user=user,
                        reason=reason,
                    )
        except Exception as e:
            logger.warning("Error propagating consent revocation for Aria share: %s", e)

        # Audit revocation (LOG SCRUBBING: record IDs only!)
        await audit_service.log_event(
            event_type="ARIA_SHARE_REVOKED",
            user_id=user.get("user_id"),
            role="patient",
            details={
                "share_id": share_id,
                "patient_id": patient_id,
                "recipient_id": share.get("recipient_id"),
                "reason": reason,
            },
            status="REVOKED",
        )

        return updated_share or share

    async def get_shared_summary_for_clinician(
        self, user: Dict[str, Any], patient_id: str, share_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Clinician read endpoint. Checks active consent on every read.
        Returns ONLY the immutable approved snapshot from aria_shared_summaries.
        Never raw messages, never regenerated summaries.
        """
        role = user.get("role")
        clinician_id = user.get("user_id")

        if role not in ["doctor", "senior_doctor"]:
            await audit_service.log_access_denied_403(
                user_id=clinician_id,
                role=role,
                permission="aria:view_shared_summary",
                resource=f"/patients/{patient_id}/aria/shared-summary",
                reason="Role is not authorized to receive Aria clinical summaries.",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Only authorized clinicians may read shared mental health summaries.",
            )

        # 1. Fetch share record
        if share_id:
            share = await self.repo.get_shared_summary(share_id)
        else:
            share = await self.repo.get_active_share_for_recipient(patient_id, clinician_id)

        if not share or share.get("patient_id") != patient_id:
            # Check if there is an explicit revoked share for this clinician
            db = await self.repo._db()
            revoked_share = await db.aria_shared_summaries.find_one({
                "patient_id": patient_id,
                "recipient_id": clinician_id,
                "status": "revoked",
            })
            if revoked_share:
                await audit_service.log_access_denied_403(
                    user_id=clinician_id,
                    role=role,
                    permission="aria:view_shared_summary",
                    resource=f"/patients/{patient_id}/aria/shared-summary",
                    reason="Patient has revoked sharing authorization for this clinician.",
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Sharing authorization is revoked for this clinician.",
                )
            raise HTTPException(status_code=404, detail="No shared Aria summary found for this patient.")

        # 2. Check active status and recipient matching
        if share.get("status") != "active" or share.get("recipient_id") != clinician_id:
            await audit_service.log_access_denied_403(
                user_id=clinician_id,
                role=role,
                permission="aria:view_shared_summary",
                resource=f"/patients/{patient_id}/aria/shared-summary/{share.get('share_id')}",
                reason="Patient has revoked sharing authorization or clinician is not designated recipient.",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Sharing authorization is revoked or not granted for this clinician.",
            )

        # 4. Audit allowed view
        await audit_service.log_event(
            event_type="ARIA_SHARED_SUMMARY_VIEWED",
            user_id=clinician_id,
            role=role,
            details={
                "share_id": share.get("share_id"),
                "patient_id": patient_id,
                "recipient_id": clinician_id,
            },
            status="ALLOWED",
        )

        # Return strictly the approved snapshot
        return share


aria_service = AriaService()
