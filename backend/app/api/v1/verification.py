from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Request
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.verification import (
    RecordComparisonResponse,
    RecordHistoryResponse,
    RecordVersionResponse,
    SubmitRecordRequest,
    VerificationDecisionRequest,
    VerificationQueueItem,
)
from backend.app.services.verification_service import verification_service

router = APIRouter()


@router.post("/verification/submit", response_model=RecordVersionResponse)
async def submit_record(
    payload: SubmitRecordRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Submits a new or updated clinical record for verifier review.
    Enforces care team scope and old-import overwrite restrictions.
    """
    client_ip = request.client.host if request.client else None
    result = await verification_service.submit_record_for_verification(
        patient_id=payload.patient_id,
        record_type=payload.record_type,
        title=payload.title,
        department=payload.department,
        hospital_id=payload.hospital_id,
        data=payload.data,
        current_user=current_user,
        record_id=payload.record_id,
        care_team_id=payload.care_team_id,
        source_document_id=payload.source_document_id,
        source_text_snippet=payload.source_text_snippet,
        extracted_fields=payload.extracted_fields,
        clinical_timestamp=payload.clinical_timestamp,
        client_ip=client_ip,
    )
    return RecordVersionResponse(**result)


@router.get("/verification/queue", response_model=List[VerificationQueueItem])
async def get_queue(
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (pending_review, requires_correction)"),
    hospital_id: Optional[str] = Query(None, description="Filter by hospital facility"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns pending records queue scoped to verifier's authority.
    """
    return await verification_service.get_verification_queue(
        current_user=current_user,
        status_filter=status,
        hospital_id_filter=hospital_id,
        skip=skip,
        limit=limit,
    )


@router.get("/verification/{version_id}", response_model=RecordComparisonResponse)
async def get_comparison(
    version_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns comparative view for review:
    - Source extraction / proposal version
    - Current approved version (if any)
    - Field-by-field diff
    - Governance approval eligibility
    """
    client_ip = request.client.host if request.client else None
    return await verification_service.get_comparison_view(
        version_id=version_id,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.post("/verification/{version_id}/decide", response_model=RecordVersionResponse)
async def decide_verification(
    version_id: str,
    payload: VerificationDecisionRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Verifier decision endpoint: approve, reject, or request correction.
    Rules:
    - Submitter cannot approve own submission.
    - Verifier authority by specialty/org enforced.
    - Reason mandatory on reject and requires_correction.
    - Append-only version history maintained.
    """
    client_ip = request.client.host if request.client else None
    result = await verification_service.decide_verification(
        version_id=version_id,
        decision=payload.decision,
        reason=payload.reason,
        human_modifications=payload.human_modifications,
        current_user=current_user,
        client_ip=client_ip,
    )
    return RecordVersionResponse(**result)


@router.get("/verification/records/{record_id}/history", response_model=RecordHistoryResponse)
async def get_record_history(
    record_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns full immutable version history chain for a clinical record.
    """
    client_ip = request.client.host if request.client else None
    return await verification_service.get_record_history(
        record_id=record_id,
        current_user=current_user,
        client_ip=client_ip,
    )
