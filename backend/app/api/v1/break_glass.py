from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.break_glass import (
    BreakGlassAdminReviewRequest,
    BreakGlassEmergencyViewResponse,
    BreakGlassRequest,
    BreakGlassSessionResponse,
)
from backend.app.services.break_glass_service import break_glass_service

router = APIRouter()


@router.post("/break-glass/request", response_model=BreakGlassSessionResponse)
async def request_emergency_break_glass(
    payload: BreakGlassRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Emergency Break-Glass Override Request:
    Permits verified non-care-team clinicians to request a 60-minute emergency access window.
    Enforces:
    - Mandatory clinical justification (min 10 characters) + standardized reason category
    - Rate limit (5 requests per hour)
    - Immutable high-priority audit event
    - In-app patient notification
    """
    client_ip = request.client.host if request.client else None
    result = await break_glass_service.request_break_glass(
        patient_id=payload.patient_id,
        user=current_user,
        justification=payload.justification,
        reason_category=payload.reason_category,
        duration_minutes=payload.duration_minutes or 60,
        client_ip=client_ip,
    )
    return BreakGlassSessionResponse(**result)


@router.get("/patients/{patient_id}/break-glass-view", response_model=BreakGlassEmergencyViewResponse)
async def get_break_glass_emergency_view(
    patient_id: str,
    request: Request,
    session_id: Optional[str] = Query(None, description="Optional break-glass session ID"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns limited emergency view strictly authorized by an active break-glass session.
    Scope limited to:
    - Agent 4 emergency summary
    - Allergies
    - Active medications
    SECURITY INVARIANT: Never returns raw Aria data or private clinician notes.
    """
    client_ip = request.client.host if request.client else None
    result = await break_glass_service.get_emergency_view(
        patient_id=patient_id,
        user=current_user,
        session_id=session_id,
        client_ip=client_ip,
    )
    return BreakGlassEmergencyViewResponse(**result)


@router.get("/break-glass/admin/sessions", response_model=List[BreakGlassSessionResponse])
async def list_admin_break_glass_sessions(
    request: Request,
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    review_status: Optional[str] = Query(None, description="Filter by review status (pending_review, justified, questioned)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """
    Administrative overview of emergency break-glass sessions across the facility.
    Accessible to hospital administrators and system administrators.
    """
    results = await break_glass_service.list_sessions(
        user=current_user,
        patient_id=patient_id,
        review_status=review_status,
        skip=skip,
        limit=limit,
    )
    return [BreakGlassSessionResponse(**s) for s in results]


@router.post("/break-glass/admin/{session_id}/review", response_model=BreakGlassSessionResponse)
async def admin_review_break_glass_session(
    session_id: str,
    payload: BreakGlassAdminReviewRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Administrative governance review: determines whether an emergency override was
    clinically 'justified' or is flagged as 'questioned' with mandatory rationale.
    """
    client_ip = request.client.host if request.client else None
    result = await break_glass_service.admin_review_session(
        session_id=session_id,
        user=current_user,
        review_status=payload.review_status,
        review_notes=payload.review_notes,
        client_ip=client_ip,
    )
    return BreakGlassSessionResponse(**result)
