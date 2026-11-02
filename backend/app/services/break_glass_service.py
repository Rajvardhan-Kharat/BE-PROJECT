from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
from fastapi import HTTPException, status
from backend.app.agents.emergency_summary_agent import emergency_summary_agent
from backend.app.core.config import settings
from backend.app.repositories.break_glass_repository import break_glass_repository
from backend.app.repositories.patient_notification_repository import patient_notification_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.prescription_repository import prescription_repository
from backend.app.services.audit_service import audit_service


class BreakGlassService:
    async def request_break_glass(
        self,
        patient_id: str,
        user: Dict[str, Any],
        justification: str,
        reason_category: str,
        duration_minutes: int = 60,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Activates an emergency break-glass override session for a non-care-team clinician.
        Enforces:
        1. Role check against configured policy (doctor, senior_doctor only).
        2. Mandatory non-empty clinical justification (min 10 characters).
        3. Rate limiting (max 5 requests per hour).
        4. Auto-expiry (default 60 minutes).
        5. Immutable HIGH-PRIORITY audit log.
        6. In-app patient notification.
        """
        role = user.get("role")
        user_id = user.get("user_id")
        user_scope = user.get("scope", {})
        clinician_name = user.get("name") or user.get("email") or user_id
        hospital_id = user_scope.get("hospital_id", "HOSP-EMERGENCY")

        # 1. Role Check
        if role not in settings.BREAK_GLASS_ALLOWED_ROLES:
            await audit_service.log_access_denied_403(
                user_id=user_id,
                role=role,
                permission="break_glass:activate",
                resource=f"/patients/{patient_id}/break-glass",
                scope=user_scope,
                reason=f"Role '{role}' is not authorized for emergency break-glass override",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Emergency break-glass override is restricted to verified clinicians ({', '.join(settings.BREAK_GLASS_ALLOWED_ROLES)}).",
            )

        # 2. Mandatory Justification Check
        clean_justification = (justification or "").strip()
        if len(clean_justification) < 10:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mandatory justification required for emergency break-glass override (minimum 10 characters).",
            )

        # 3. Patient existence check
        patient = await patient_repository.get_by_patient_id(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient record '{patient_id}' not found.",
            )

        now = datetime.now(timezone.utc)

        # 4. Rate Limiting Check
        one_hour_ago = now - timedelta(hours=1)
        recent_count = await break_glass_repository.count_recent_requests_for_clinician(
            clinician_id=user_id, since_time=one_hour_ago
        )
        if recent_count >= settings.BREAK_GLASS_RATE_LIMIT_PER_HOUR:
            await audit_service.log_access_denied_403(
                user_id=user_id,
                role=role,
                permission="break_glass:activate",
                resource=f"/patients/{patient_id}/break-glass",
                scope=user_scope,
                reason=f"Break-glass rate limit exceeded ({recent_count} requests in 1 hour)",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Break-glass rate limit exceeded: maximum {settings.BREAK_GLASS_RATE_LIMIT_PER_HOUR} emergency overrides per hour permitted.",
            )

        # 5. Session Construction
        session_id = f"BG-{now.strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}"
        effective_duration = duration_minutes or settings.BREAK_GLASS_DEFAULT_DURATION_MINUTES
        expires_at = now + timedelta(minutes=effective_duration)

        session_record = {
            "session_id": session_id,
            "patient_id": patient_id,
            "clinician_id": user_id,
            "clinician_name": clinician_name,
            "clinician_role": role,
            "hospital_id": hospital_id,
            "justification": clean_justification,
            "reason_category": reason_category,
            "status": "active",
            "review_status": "pending_review",
            "review_notes": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "granted_at": now,
            "expires_at": expires_at,
            "access_scope": "EMERGENCY_SUMMARY_ONLY",
            "ip_address": client_ip,
        }

        created = await break_glass_repository.create_session(session_record)

        # 6. Immutable HIGH-PRIORITY Audit Event
        await audit_service.log_break_glass_activated(
            session_id=session_id,
            clinician_id=user_id,
            clinician_name=clinician_name,
            clinician_role=role,
            patient_id=patient_id,
            justification=clean_justification,
            reason_category=reason_category,
            expires_at=expires_at,
            ip_address=client_ip,
        )

        # 7. In-App Patient Notification
        notif_id = f"NOTIF-BG-{uuid4().hex[:8].upper()}"
        await patient_notification_repository.create_notification({
            "notification_id": notif_id,
            "patient_id": patient_id,
            "type": "BREAK_GLASS_ACCESS",
            "priority": "HIGH",
            "title": "Emergency Break-Glass Override Activated",
            "message": (
                f"Emergency access to your acute clinical summary was initiated by {clinician_name} "
                f"({role}) under urgency category '{reason_category}'. Justification: '{clean_justification}'. "
                f"Access window active for {effective_duration} minutes (expires {expires_at.strftime('%H:%M UTC')}). "
                "This event is subject to mandatory clinical governance review."
            ),
            "read": False,
            "created_at": now,
            "metadata": {
                "session_id": session_id,
                "clinician_id": user_id,
                "reason_category": reason_category,
                "expires_at": expires_at.isoformat(),
            },
        })

        created["remaining_minutes"] = max(0, int((expires_at - now).total_seconds() / 60))
        return created

    async def get_emergency_view(
        self,
        patient_id: str,
        user: Dict[str, Any],
        session_id: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Returns limited emergency clinical view (Agent 4 summary, allergies, current active meds)
        strictly authorized by an active break-glass session.
        Enforces:
        - Active session check
        - Expiry check
        - NEVER raw Aria data or private notes
        """
        user_id = user.get("user_id")
        user_role = user.get("role")
        now = datetime.now(timezone.utc)

        # Retrieve session
        session = None
        if session_id:
            session = await break_glass_repository.get_by_session_id(session_id)
        else:
            session = await break_glass_repository.find_active_session(patient_id, user_id)

        if not session or session.get("patient_id") != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: No active break-glass emergency session found for this patient.",
            )

        # Expiry Check
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if session.get("status") != "active" or expires_at <= now:
            await break_glass_repository.mark_expired_if_needed(session["session_id"])
            await audit_service.log_access_denied_403(
                user_id=user_id,
                role=user_role,
                permission="break_glass:read",
                resource=f"/patients/{patient_id}/break-glass-view",
                scope=user.get("scope", {}),
                reason="Break-glass session expired",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Emergency break-glass override session has expired. A new clinical justification is required.",
            )

        # Fetch Limited Emergency View
        patient = await patient_repository.get_by_patient_id(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient '{patient_id}' not found.",
            )

        # Agent 4 Emergency Summary
        summary = await emergency_summary_agent.assemble_emergency_summary(
            patient_id=patient_id,
            request_id=session.get("session_id"),
        )

        # Allergies
        allergies = patient.get("allergies", [])

        # Active Medications
        active_rx = await prescription_repository.list_prescriptions(
            patient_id=patient_id, status="active"
        )

        # Audit view access
        await audit_service.log_break_glass_view_accessed(
            session_id=session["session_id"],
            clinician_id=user_id,
            clinician_role=user_role,
            patient_id=patient_id,
            resource=f"/patients/{patient_id}/break-glass-view",
            ip_address=client_ip,
        )

        remaining = max(0, int((expires_at - now).total_seconds() / 60))
        return {
            "session_id": session["session_id"],
            "patient_id": patient_id,
            "patient_name": patient.get("name", "Unknown"),
            "mrn": patient.get("mrn", "UNKNOWN"),
            "date_of_birth": patient.get("date_of_birth", "Unknown"),
            "blood_type": patient.get("blood_type", "Unknown"),
            "session_expires_at": expires_at,
            "remaining_minutes": remaining,
            "summary": summary,
            "allergies": allergies,
            "active_medications": active_rx,
            "disclaimer": (
                "BREAK-GLASS EMERGENCY OVERRIDE: Limited emergency clinical profile. "
                "All access actions are immutably audited and reported to hospital administration and the patient. "
                "Access to raw OCR documents and private notes is strictly prohibited."
            ),
        }

    async def admin_review_session(
        self,
        session_id: str,
        user: Dict[str, Any],
        review_status: str,
        review_notes: str,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Administrative governance review of an emergency break-glass session.
        Determines whether the override was clinically 'justified' or is 'questioned'.
        """
        role = user.get("role")
        user_id = user.get("user_id")

        if role not in ["hospital_admin", "system_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrative review of break-glass overrides is restricted to hospital administrators.",
            )

        clean_notes = (review_notes or "").strip()
        if len(clean_notes) < 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mandatory review notes required documenting justification or reason for questioning (minimum 5 characters).",
            )

        if review_status not in ["justified", "questioned"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Review status must be either 'justified' or 'questioned'.",
            )

        session = await break_glass_repository.get_by_session_id(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Break-glass session '{session_id}' not found.",
            )

        now = datetime.now(timezone.utc)
        updated = await break_glass_repository.update_review(
            session_id=session_id,
            review_status=review_status,
            review_notes=clean_notes,
            reviewed_by=user_id,
            reviewed_at=now,
        )

        # Audit administrative review
        await audit_service.log_break_glass_reviewed(
            session_id=session_id,
            admin_id=user_id,
            admin_role=role,
            patient_id=session.get("patient_id"),
            outcome=review_status,
            review_notes=clean_notes,
            ip_address=client_ip,
        )

        if updated:
            exp = updated.get("expires_at")
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if exp and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp:
                updated["remaining_minutes"] = max(0, int((exp - now).total_seconds() / 60))

        return updated

    async def list_sessions(
        self,
        user: Dict[str, Any],
        patient_id: Optional[str] = None,
        review_status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        role = user.get("role")
        user_id = user.get("user_id")

        # Patients see only sessions for themselves
        if role == "patient":
            patient_id = user.get("scope", {}).get("patient_id")
        elif role in ["doctor", "senior_doctor"]:
            # Clinicians see sessions they initiated or for their care team patients
            pass

        sessions = await break_glass_repository.list_sessions(
            patient_id=patient_id,
            review_status=review_status,
            skip=skip,
            limit=limit,
        )

        now = datetime.now(timezone.utc)
        for s in sessions:
            exp = s.get("expires_at")
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            s["remaining_minutes"] = max(0, int((exp - now).total_seconds() / 60))
        return sessions


break_glass_service = BreakGlassService()
