from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from backend.app.permissions.rbac import require
from backend.app.repositories.audit_repository import audit_repository
from backend.app.schemas.audit import AuditEventResponse

router = APIRouter()


@router.get("/audit", response_model=List[AuditEventResponse])
async def list_audit_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = None,
    current_user: dict = Depends(require("audit:read")),
):
    """Retrieves immutable audit events. Restricted to users with 'audit:read' permission."""
    query = {}
    if event_type:
        query["event_type"] = event_type

    events = await audit_repository.query_events(query=query, skip=skip, limit=limit)
    return [
        AuditEventResponse(
            id=e["id"],
            event_type=e["event_type"],
            user_id=e.get("user_id"),
            role=e.get("role"),
            status=e.get("status", "SUCCESS"),
            details=e.get("details", {}),
            ip_address=e.get("ip_address"),
            timestamp=e["timestamp"],
        )
        for e in events
    ]
