from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.collaboration import (
    CitedSummaryRequest,
    CitedSummaryResponse,
    ClinicalNoteCreate,
    ClinicalNoteResponse,
    ClinicalTaskCreate,
    ClinicalTaskResponse,
    ClinicalTaskUpdate,
    NotificationsListResponse,
    SpecialistQueryCreate,
    SpecialistQueryReplyCreate,
    SpecialistQueryResponse,
)
from backend.app.services.collaboration_service import collaboration_service

router = APIRouter()


# -----------------------------------------------------------------------------
# Second Memory: Clinical Notes & Search
# -----------------------------------------------------------------------------

@router.get("/collaboration/notes/patient/{patient_id}", response_model=List[ClinicalNoteResponse])
async def search_clinical_notes(
    patient_id: str,
    request: Request,
    q: Optional[str] = Query(None, description="Keyword search query"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    author_id: Optional[str] = Query(None, description="Filter by author ID"),
    specialty: Optional[str] = Query(None, description="Filter by clinical specialty"),
    date_from: Optional[str] = Query(None, description="Filter notes on or after date"),
    date_to: Optional[str] = Query(None, description="Filter notes on or before date"),
    current_user: dict = Depends(get_current_user),
) -> List[ClinicalNoteResponse]:
    """
    Search and filter clinical notes.
    Enforces authorization scope and strictly hides other clinicians' private notes.
    """
    client_ip = request.client.host if request.client else None
    return await collaboration_service.search_clinical_notes(
        patient_id=patient_id,
        current_user=current_user,
        query=q,
        tag=tag,
        author_id=author_id,
        specialty=specialty,
        date_from=date_from,
        date_to=date_to,
        client_ip=client_ip,
    )


@router.post("/collaboration/notes", response_model=ClinicalNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_clinical_note(
    payload: ClinicalNoteCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> ClinicalNoteResponse:
    """
    Creates a new clinical note in Second Memory (shared with care team or private).
    """
    client_ip = request.client.host if request.client else None
    return await collaboration_service.create_clinical_note(
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.get("/collaboration/notes/{note_id}", response_model=ClinicalNoteResponse)
async def get_clinical_note(
    note_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> ClinicalNoteResponse:
    """
    Retrieves a single clinical note.
    MANDATORY: Private notes are strictly forbidden to non-authors (403 + audit).
    """
    client_ip = request.client.host if request.client else None
    return await collaboration_service.get_clinical_note(
        note_id=note_id,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.post(
    "/collaboration/notes/patient/{patient_id}/cited-summary",
    response_model=CitedSummaryResponse,
)
async def generate_cited_summary(
    patient_id: str,
    payload: CitedSummaryRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> CitedSummaryResponse:
    """
    Generates a cited clinical summary over notes within a date range and topic filter,
    including exact record list, quotes, and metadata.
    """
    client_ip = request.client.host if request.client else None
    return await collaboration_service.generate_cited_summary(
        patient_id=patient_id,
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


# -----------------------------------------------------------------------------
# Care-Team Workspace: Tasks
# -----------------------------------------------------------------------------

@router.get("/collaboration/tasks/patient/{patient_id}", response_model=List[ClinicalTaskResponse])
async def list_patient_tasks(
    patient_id: str,
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (pending, in_progress, completed)"),
    current_user: dict = Depends(get_current_user),
) -> List[ClinicalTaskResponse]:
    """Lists clinical tasks for a patient."""
    client_ip = request.client.host if request.client else None
    return await collaboration_service.list_tasks(
        patient_id=patient_id,
        current_user=current_user,
        status_filter=status,
        client_ip=client_ip,
    )


@router.post("/collaboration/tasks", response_model=ClinicalTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: ClinicalTaskCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> ClinicalTaskResponse:
    """Creates a new care team task and notifies the assignee."""
    client_ip = request.client.host if request.client else None
    return await collaboration_service.create_task(
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.patch("/collaboration/tasks/{task_id}", response_model=ClinicalTaskResponse)
async def update_task(
    task_id: str,
    payload: ClinicalTaskUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> ClinicalTaskResponse:
    """Updates status or notes on a clinical task."""
    client_ip = request.client.host if request.client else None
    return await collaboration_service.update_task(
        task_id=task_id,
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


# -----------------------------------------------------------------------------
# Specialist Queries
# -----------------------------------------------------------------------------

@router.get("/collaboration/queries/patient/{patient_id}", response_model=List[SpecialistQueryResponse])
async def list_specialist_queries(
    patient_id: str,
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (open, answered, closed)"),
    current_user: dict = Depends(get_current_user),
) -> List[SpecialistQueryResponse]:
    """Lists inter-specialist query threads for a patient."""
    client_ip = request.client.host if request.client else None
    return await collaboration_service.list_specialist_queries(
        patient_id=patient_id,
        current_user=current_user,
        status_filter=status,
        client_ip=client_ip,
    )


@router.post("/collaboration/queries", response_model=SpecialistQueryResponse, status_code=status.HTTP_201_CREATED)
async def create_specialist_query(
    payload: SpecialistQueryCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> SpecialistQueryResponse:
    """Sends a question to another specialist and notifies them."""
    client_ip = request.client.host if request.client else None
    return await collaboration_service.create_specialist_query(
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.post("/collaboration/queries/{query_id}/reply", response_model=SpecialistQueryResponse)
async def reply_specialist_query(
    query_id: str,
    payload: SpecialistQueryReplyCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> SpecialistQueryResponse:
    """Replies to a specialist query and notifies the asking doctor."""
    client_ip = request.client.host if request.client else None
    return await collaboration_service.reply_specialist_query(
        query_id=query_id,
        payload=payload,
        current_user=current_user,
        client_ip=client_ip,
    )


# -----------------------------------------------------------------------------
# In-App Notifications
# -----------------------------------------------------------------------------

@router.get("/notifications", response_model=NotificationsListResponse)
async def get_my_notifications(
    current_user: dict = Depends(get_current_user),
) -> NotificationsListResponse:
    """Returns in-app notifications and unread count for current user."""
    return await collaboration_service.get_user_notifications(current_user=current_user)


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Marks a notification as read."""
    success = await collaboration_service.mark_notification_as_read(
        notification_id=notification_id,
        current_user=current_user,
    )
    return {"status": "success" if success else "not_modified"}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Marks all user notifications as read."""
    count = await collaboration_service.mark_all_notifications_as_read(current_user=current_user)
    return {"status": "success", "marked_read_count": count}
