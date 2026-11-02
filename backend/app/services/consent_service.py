from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
from fastapi import HTTPException, status
from backend.app.core.config import settings
from backend.app.repositories.consent_repository import consent_repository
from backend.app.repositories.patient_notification_repository import patient_notification_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.services.audit_service import audit_service


class ConsentService:
    async def grant_consent(
        self,
        patient_id: str,
        user: Dict[str, Any],
        recipient: str,
        purpose: str = "treatment",
        categories: Optional[List[str]] = None,
        text_version: Optional[str] = None,
        effective_from: Optional[datetime] = None,
        expires_at: Optional[datetime] = None,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Grants explicit clinical data sharing consent.
        Patient or authorized administrator may execute this grant.
        """
        role = user.get("role")
        user_id = user.get("user_id")
        user_scope = user.get("scope", {})

        # Authorization: Patient self or admin
        if role == "patient":
            if user_scope.get("patient_id") != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Patients may only manage their own consent directives.",
                )
        elif role not in ["hospital_admin", "system_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Clinicians cannot self-grant patient consent.",
            )

        patient = await patient_repository.get_by_patient_id(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient '{patient_id}' not found.",
            )

        now = datetime.now(timezone.utc)
        consent_id = f"CONSENT-{now.strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}"
        resolved_categories = categories or ["*"]
        resolved_effective = effective_from or now
        resolved_text_version = text_version or settings.CONSENT_DEFAULT_TEXT_VERSION

        consent_record = {
            "consent_id": consent_id,
            "patient_id": patient_id,
            "purpose": purpose,
            "categories": resolved_categories,
            "recipient": recipient,
            "text_version": resolved_text_version,
            "status": "granted",
            "effective_from": resolved_effective,
            "expires_at": expires_at,
            "revoked_at": None,
            "revocation_reason": None,
            "granted_by": user_id,
            "created_at": now,
            "updated_at": now,
        }

        created = await consent_repository.create_consent(consent_record)

        # Ensure patient active_consent flag is true
        await patient_repository.update_patient(patient_id, {"active_consent": True})

        # Append audit event
        await audit_service.log_consent_granted(
            consent_id=consent_id,
            patient_id=patient_id,
            granted_by=user_id,
            recipient=recipient,
            purpose=purpose,
            categories=resolved_categories,
            ip_address=client_ip,
        )

        return created

    async def revoke_consent(
        self,
        consent_id: str,
        user: Dict[str, Any],
        reason: str,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Revokes a clinical consent directive with mandatory clinical rationale.
        Enforces backend block on future reads for the revoked scope.
        """
        if not reason or len(reason.strip()) < 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mandatory reason required for consent revocation (minimum 5 characters).",
            )

        consent = await consent_repository.get_by_consent_id(consent_id)
        if not consent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Consent record '{consent_id}' not found.",
            )

        patient_id = consent["patient_id"]
        role = user.get("role")
        user_id = user.get("user_id")
        user_scope = user.get("scope", {})

        # Authorization: Patient self or admin
        if role == "patient":
            if user_scope.get("patient_id") != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Patients may only revoke their own consent directives.",
                )
        elif role not in ["hospital_admin", "system_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Clinicians cannot revoke patient consent.",
            )

        now = datetime.now(timezone.utc)
        updated = await consent_repository.revoke_consent(
            consent_id=consent_id,
            reason=reason.strip(),
            revoked_at=now,
        )

        # Create in-app patient notification
        notif_id = f"NOTIF-REVOKE-{uuid4().hex[:8].upper()}"
        await patient_notification_repository.create_notification({
            "notification_id": notif_id,
            "patient_id": patient_id,
            "type": "CONSENT_REVOCATION",
            "priority": "HIGH",
            "title": "Clinical Consent Directive Revoked",
            "message": (
                f"You successfully revoked data sharing consent ({consent_id}) for "
                f"recipient '{consent.get('recipient')}'. Reason: '{reason.strip()}'. "
                "Non-emergency sharing is now blocked."
            ),
            "read": False,
            "created_at": now,
            "metadata": {"consent_id": consent_id, "recipient": consent.get("recipient")},
        })

        # Append audit log
        await audit_service.log_consent_revoked(
            consent_id=consent_id,
            patient_id=patient_id,
            revoked_by=user_id,
            reason=reason.strip(),
            recipient=consent.get("recipient", "*"),
            ip_address=client_ip,
        )

        return updated

    async def list_consents_for_patient(
        self, patient_id: str, user: Dict[str, Any], status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        role = user.get("role")
        user_scope = user.get("scope", {})

        if role == "patient" and user_scope.get("patient_id") != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patients may only inspect their own consent directives.",
            )

        return await consent_repository.list_by_patient_id(patient_id, status=status)

    async def check_read_consent(
        self,
        patient_id: str,
        recipient: Optional[str] = None,
        purpose: str = "treatment",
        category: str = "*",
    ) -> bool:
        """
        Enforced on every relevant clinical read:
        1. If an explicit revocation matches the recipient or category, returns False (blocked).
        2. If active granted consent exists, returns True.
        3. If no consent records exist at all, falls back to patient's default active_consent flag.
        """
        # 1. Check explicit revocation
        has_revoked = await consent_repository.has_explicit_revocation(
            patient_id=patient_id,
            recipient=recipient,
            category=category,
        )
        if has_revoked:
            return False

        # 2. Check active granted consent
        active = await consent_repository.find_active_consent_for_read(
            patient_id=patient_id,
            recipient=recipient,
            purpose=purpose,
            category=category,
        )
        if active:
            return True

        # 3. Fallback: check overall patient active_consent
        patient = await patient_repository.get_by_patient_id(patient_id)
        if not patient:
            return False
        return bool(patient.get("active_consent", True))


consent_service = ConsentService()
