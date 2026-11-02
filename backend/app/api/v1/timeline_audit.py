from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.timeline_audit import (
    TimelineAuditReport,
    TimelineConflict,
    TimelineConflictResolveRequest,
)
from backend.app.services.patient_service import patient_service
from backend.app.services.timeline_audit_service import timeline_audit_service

router = APIRouter()


@router.get("/patients/{patient_id}/timeline/audit", response_model=TimelineAuditReport)
async def get_patient_timeline_audit(
    patient_id: str,
    request: Request,
    hospital_id: Optional[str] = Query(None, description="Filter by hospital facility ID"),
    department: Optional[str] = Query(None, description="Filter by specialty or department"),
    event_type: Optional[str] = Query(None, description="Filter by event type (prescription, clinical_encounter, verified_clinical_record)"),
    conflict_only: bool = Query(False, description="Filter only events that have conflict markers"),
    current_user: dict = Depends(get_current_user),
):
    """
    Chronological timeline across hospitals and specialties, preserving conflicting records.
    Detects inconsistent dates, medication status contradictions, dosing inconsistencies, and stale imports.
    INVARIANT: Does NOT assume newest is correct; flags all dates and sources.
    """
    client_ip = request.client.host if request.client else None

    # Scope check: patient sees self; doctor sees care-team patients; audit check
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )

    try:
        return await timeline_audit_service.get_patient_timeline_audit(
            patient_id=patient_id,
            current_user=current_user,
            hospital_id_filter=hospital_id,
            department_filter=department,
            event_type_filter=event_type,
            conflict_only=conflict_only,
            client_ip=client_ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/timeline/conflicts/{conflict_id}/resolve", response_model=TimelineConflict)
async def resolve_timeline_conflict(
    conflict_id: str,
    payload: TimelineConflictResolveRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Clinician resolution of a detected timeline conflict.
    Mandatory clinical reason is required; action is strictly audited.
    Only authorized clinicians (doctor, senior_doctor, system_admin) can resolve conflicts.
    """
    client_ip = request.client.host if request.client else None
    role = current_user.get("role", "")
    if role not in ["doctor", "senior_doctor", "system_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clinical verifiers and attending doctors can resolve timeline conflicts.",
        )

    try:
        return await timeline_audit_service.resolve_conflict(
            conflict_id=conflict_id,
            resolution_action=payload.resolution_action,
            reason=payload.reason,
            current_user=current_user,
            client_ip=client_ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
