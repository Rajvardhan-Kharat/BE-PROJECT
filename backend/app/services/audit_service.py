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


audit_service = AuditService()
