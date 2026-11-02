import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from backend.app.repositories.audit_repository import audit_repository

logger = logging.getLogger("vericare.audit")


class AuditService:
    def __init__(self, repo=audit_repository):
        self.repo = repo

    async def log_event(
        self,
        event_type: str,
        user_id: Optional[str],
        role: Optional[str],
        details: Dict[str, Any],
        status: str = "SUCCESS",
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Appends an event to the audit trail."""
        record = {
            "event_type": event_type,
            "user_id": user_id,
            "role": role,
            "status": status,
            "details": details,
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc),
        }
        event = await self.repo.append_event(record)
        logger.info(
            "AUDIT [%s] user=%s role=%s status=%s",
            event_type,
            user_id,
            role,
            status,
        )
        return event

    async def log_login_success(
        self, user_id: str, role: str, email: str, ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="AUTH_LOGIN",
            user_id=user_id,
            role=role,
            details={"email": email, "outcome": "SUCCESS"},
            status="SUCCESS",
            ip_address=ip_address,
        )

    async def log_login_failure(
        self, email: str, reason: str, ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="AUTH_LOGIN_FAILED",
            user_id=None,
            role=None,
            details={"attempted_email": email, "reason": reason},
            status="FAILURE",
            ip_address=ip_address,
        )

    async def log_logout(
        self, user_id: str, role: str, jti: str, ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="AUTH_LOGOUT",
            user_id=user_id,
            role=role,
            details={"jti": jti},
            status="SUCCESS",
            ip_address=ip_address,
        )

    async def log_access_denied_403(
        self,
        user_id: Optional[str],
        role: Optional[str],
        permission: str,
        resource: Optional[str] = None,
        scope: Optional[Dict[str, Any]] = None,
        reason: str = "Permission or scope requirement not met",
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Strict requirement: every 403 access denial is logged to the audit repository."""
        return await self.log_event(
            event_type="ACCESS_DENIED_403",
            user_id=user_id,
            role=role,
            details={
                "requested_permission": permission,
                "target_resource": resource,
                "user_scope": scope or {},
                "reason": reason,
            },
            status="DENIED",
            ip_address=ip_address,
        )

    async def log_break_glass_activated(
        self,
        session_id: str,
        clinician_id: str,
        clinician_name: str,
        clinician_role: str,
        patient_id: str,
        justification: str,
        reason_category: str,
        expires_at: datetime,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Immutable HIGH-PRIORITY audit event for emergency break-glass overrides.
        Flags severity as CRITICAL and priority as HIGH for administrative inspection.
        """
        record = {
            "event_type": "BREAK_GLASS_ACTIVATED",
            "priority": "HIGH",
            "severity": "CRITICAL",
            "user_id": clinician_id,
            "role": clinician_role,
            "status": "EMERGENCY_OVERRIDE",
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc),
            "details": {
                "session_id": session_id,
                "patient_id": patient_id,
                "clinician_name": clinician_name,
                "justification": justification,
                "reason_category": reason_category,
                "expires_at": expires_at.isoformat(),
                "access_scope": "EMERGENCY_SUMMARY_ONLY",
            },
        }
        event = await self.repo.append_event(record)
        logger.warning(
            "CRITICAL AUDIT [BREAK_GLASS_ACTIVATED] session=%s clinician=%s patient=%s reason=%s",
            session_id,
            clinician_id,
            patient_id,
            reason_category,
        )
        return event

    async def log_break_glass_view_accessed(
        self,
        session_id: str,
        clinician_id: str,
        clinician_role: str,
        patient_id: str,
        resource: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="BREAK_GLASS_VIEW_ACCESSED",
            user_id=clinician_id,
            role=clinician_role,
            details={
                "session_id": session_id,
                "patient_id": patient_id,
                "resource": resource,
            },
            status="SUCCESS",
            ip_address=ip_address,
        )

    async def log_break_glass_reviewed(
        self,
        session_id: str,
        admin_id: str,
        admin_role: str,
        patient_id: str,
        outcome: str,
        review_notes: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="BREAK_GLASS_ADMIN_REVIEWED",
            user_id=admin_id,
            role=admin_role,
            details={
                "session_id": session_id,
                "patient_id": patient_id,
                "outcome": outcome,
                "review_notes": review_notes,
            },
            status="REVIEWED",
            ip_address=ip_address,
        )

    async def log_consent_granted(
        self,
        consent_id: str,
        patient_id: str,
        granted_by: str,
        recipient: str,
        purpose: str,
        categories: list,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="CONSENT_GRANTED",
            user_id=granted_by,
            role="patient",
            details={
                "consent_id": consent_id,
                "patient_id": patient_id,
                "recipient": recipient,
                "purpose": purpose,
                "categories": categories,
            },
            status="SUCCESS",
            ip_address=ip_address,
        )

    async def log_consent_revoked(
        self,
        consent_id: str,
        patient_id: str,
        revoked_by: str,
        reason: str,
        recipient: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.log_event(
            event_type="CONSENT_REVOKED",
            user_id=revoked_by,
            role="patient",
            details={
                "consent_id": consent_id,
                "patient_id": patient_id,
                "reason": reason,
                "recipient": recipient,
            },
            status="REVOKED",
            ip_address=ip_address,
        )

    async def get_patient_access_events(
        self, patient_id: str, skip: int = 0, limit: int = 100
    ) -> list:
        collection = await self.repo.get_collection()
        cursor = collection.find({
            "$or": [
                {"details.patient_id": patient_id},
                {"details.target_resource": {"$regex": patient_id}},
                {"details.resource": {"$regex": patient_id}},
            ]
        }).sort("timestamp", -1).skip(skip).limit(limit)
        results = []
        async for doc in cursor:
            if "_id" in doc:
                doc["id"] = str(doc.pop("_id"))
            results.append(doc)
        return results


audit_service = AuditService()
