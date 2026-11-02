from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, Query, Request, status
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.followup import (
    FollowUpCreateRequest,
    FollowUpEvaluationResult,
    FollowUpResponse,
    FollowUpStatusUpdateRequest,
)
from backend.app.services.followup_service import followup_service

router = APIRouter()


@router.get("/followups/patient/{patient_id}", response_model=List[FollowUpResponse])
async def list_patient_followups(
    patient_id: str,
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (upcoming, overdue, completed, deferred, needs_review)"),
    type: Optional[str] = Query(None, description="Filter by type (appointment, medication_course, lab_test, imaging)"),
    current_user: dict = Depends(get_current_user),
) -> List[FollowUpResponse]:
    """
    Returns scoped follow-ups and medication courses for a patient.
    MANDATORY CLINICAL GUARDRAIL: Adherence is never inferred.
    """
    client_ip = request.client.host if request.client else None
    return await followup_service.list_patient_followups(
        patient_id=patient_id,
        current_user=current_user,
        status_filter=status,
        type_filter=type,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )


@router.post("/followups", response_model=FollowUpResponse, status_code=status.HTTP_201_CREATED)
async def create_followup(
    payload: FollowUpCreateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> FollowUpResponse:
    """
    Creates a new clinical follow-up appointment or medication course.
    """
    client_ip = request.client.host if request.client else None
    return await followup_service.create_followup(
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.patch("/followups/{follow_up_id}/status", response_model=FollowUpResponse)
async def update_followup_status(
    follow_up_id: str,
    payload: FollowUpStatusUpdateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> FollowUpResponse:
    """
    Updates follow-up status (completed, deferred, needs_review) with mandatory clinical reason.
    """
    client_ip = request.client.host if request.client else None
    return await followup_service.update_followup_status(
        follow_up_id=follow_up_id,
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.post("/followups/patient/{patient_id}/evaluate", response_model=FollowUpEvaluationResult)
async def evaluate_followups_with_agent(
    patient_id: str,
    request: Request,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
    current_user: dict = Depends(get_current_user),
) -> FollowUpEvaluationResult:
    """
    Runs Agent 5 deterministic follow-up evaluation against approved records and schedule calendar.
    """
    client_ip = request.client.host if request.client else None
    return await followup_service.evaluate_with_agent(
        patient_id=patient_id,
        current_user=current_user,
        request_id=x_request_id,
        client_ip=client_ip,
    )
