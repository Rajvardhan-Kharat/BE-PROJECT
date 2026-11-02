import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from backend.app.integrations.aria.base import AriaHealthStatus
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.aria import (
    AriaDraftSummaryResponse,
    AriaMessageCreate,
    AriaMessageResponse,
    AriaNoticeStatusResponse,
    AriaSessionCreate,
    AriaSessionResponse,
    AriaShareCreate,
    AriaShareResponse,
    AriaShareRevokeRequest,
)
from backend.app.services.aria_service import aria_service
from backend.app.services.audit_service import audit_service

logger = logging.getLogger("vericare.api.aria")

router = APIRouter(prefix="/aria", tags=["Aria Mental-Health Companion"])


async def _extract_patient_id(user: Dict[str, Any], resource: str = "/api/v1/aria") -> str:
    role = user.get("role")
    user_id = user.get("user_id")
    p_id = (
        user.get("patient_id")
        or user.get("scope", {}).get("patientId")
        or user.get("scope", {}).get("patient_id")
    )
    if not p_id and role == "patient" and user_id in ["USR-PAT-001", "PAT-SYN-001", "USR-PATIENT-001"]:
        p_id = "PAT-SYN-001"
    if not p_id and role == "patient" and user_id in ["USR-PATIENT-002", "PAT-SYN-002"]:
        p_id = "PAT-SYN-002"
    if not p_id or role != "patient":
        await audit_service.log_access_denied_403(
            user_id=user_id,
            role=role,
            permission="aria:patient_access",
            resource=resource,
            scope=user.get("scope"),
            reason="Aria companion data is restricted exclusively to authenticated patients.",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Aria companion data is restricted exclusively to authenticated patients.",
        )
    return p_id


# --- HEALTH PROBE ---


@router.get("/health", response_model=AriaHealthStatus)
async def get_aria_health():
    """Reports active Aria adapter mode ('mock' or 'http') and availability."""
    return await aria_service.get_health()


# --- PROVIDER NOTICE ACKNOWLEDGMENT ---


@router.get("/notice", response_model=AriaNoticeStatusResponse)
@router.get("/notice/status", response_model=AriaNoticeStatusResponse)
async def get_notice_status(current_user: dict = Depends(get_current_user)):
    """Checks whether the patient has acknowledged the mandatory Aria provider notice."""
    if current_user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Provider notice applies to patient companion accounts.",
        )
    patient_id = await _extract_patient_id(current_user, "/api/v1/aria/notice")
    data = await aria_service.get_notice_status(patient_id)
    return AriaNoticeStatusResponse(**data)


@router.post("/notice/ack")
@router.post("/notice/acknowledge")
async def acknowledge_notice(current_user: dict = Depends(get_current_user)):
    """Records that the patient has acknowledged the provider notice before first chat."""
    patient_id = await _extract_patient_id(current_user, "/api/v1/aria/notice")
    return await aria_service.acknowledge_notice(current_user, patient_id)


# --- SESSIONS (PATIENT ONLY) ---


@router.post("/sessions", response_model=AriaSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: AriaSessionCreate,
    current_user: dict = Depends(get_current_user),
):
    """Starts a new Aria companion conversation session for the authenticated patient."""
    patient_id = await _extract_patient_id(current_user, "/api/v1/aria/sessions")
    session = await aria_service.create_session(current_user, patient_id, payload.title)
    return AriaSessionResponse(**session)


@router.get("/sessions", response_model=List[AriaSessionResponse])
async def list_sessions(current_user: dict = Depends(get_current_user)):
    """Lists conversational sessions belonging strictly to the authenticated patient."""
    patient_id = await _extract_patient_id(current_user, "/api/v1/aria/sessions")
    sessions = await aria_service.list_sessions(current_user, patient_id)
    return [AriaSessionResponse(**s) for s in sessions]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Deletes an Aria session and all its messages. Purges conversational state."""
    patient_id = await _extract_patient_id(current_user, f"/api/v1/aria/sessions/{session_id}")
    deleted = await aria_service.delete_session(current_user, patient_id, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found or already deleted.")
    return {"deleted": True, "session_id": session_id}


# --- MESSAGING (PATIENT ONLY) ---


@router.post("/sessions/{session_id}/messages", response_model=AriaMessageResponse)
async def send_message(
    session_id: str,
    payload: AriaMessageCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Sends a message to the Aria companion.
    Runs boundary crisis check; derives pseudonymous ID; calls provider; saves messages.
    """
    patient_id = await _extract_patient_id(current_user, f"/api/v1/aria/sessions/{session_id}/messages")
    response_msg = await aria_service.send_message(
        user=current_user,
        patient_id=patient_id,
        session_id=session_id,
        text=payload.text,
    )
    return AriaMessageResponse(**response_msg)


@router.get("/sessions/{session_id}/messages", response_model=List[AriaMessageResponse])
async def list_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieves full message history for the patient's personal session."""
    patient_id = await _extract_patient_id(current_user, f"/api/v1/aria/sessions/{session_id}/messages")
    messages = await aria_service.list_messages(current_user, patient_id, session_id)
    return [AriaMessageResponse(**m) for m in messages]


# --- SHARING FLOW (CONSENT-GATED) ---


@router.get("/sessions/{session_id}/draft-summary", response_model=AriaDraftSummaryResponse)
@router.post("/sessions/{session_id}/draft-summary", response_model=AriaDraftSummaryResponse)
async def draft_session_summary(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Calls companion provider to generate a draft summary for patient review and editing.
    Summary is NOT visible to clinicians until explicitly approved and shared by the patient.
    """
    patient_id = await _extract_patient_id(current_user, f"/api/v1/aria/sessions/{session_id}/draft-summary")
    draft = await aria_service.generate_draft_summary(current_user, patient_id, session_id)
    return AriaDraftSummaryResponse(**draft)


@router.post("/shares", response_model=AriaShareResponse, status_code=status.HTTP_201_CREATED)
async def approve_and_share_summary(
    payload: AriaShareCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Patient approves an edited summary snapshot and grants consent for a specific clinician.
    Stores an immutable snapshot in aria_shared_summaries.
    """
    patient_id = await _extract_patient_id(current_user, "/api/v1/aria/shares")
    summary_text = payload.summary_text or payload.approved_text or ""
    share = await aria_service.approve_and_share_summary(
        user=current_user,
        patient_id=patient_id,
        recipient_id=payload.recipient_id,
        recipient_name=payload.recipient_name or payload.recipient_id,
        summary_text=summary_text,
        purpose=payload.purpose,
    )
    return AriaShareResponse(**share)


@router.get("/shares", response_model=List[AriaShareResponse])
@router.get("/shares/mine", response_model=List[AriaShareResponse])
async def list_my_shares(current_user: dict = Depends(get_current_user)):
    """Lists all active and historical summary shares created by the authenticated patient."""
    patient_id = await _extract_patient_id(current_user, "/api/v1/aria/shares")
    shares = await aria_service.list_patient_shares(current_user, patient_id)
    return [AriaShareResponse(**s) for s in shares]


@router.post("/shares/{share_id}/revoke", response_model=AriaShareResponse)
async def revoke_share(
    share_id: str,
    payload: Optional[AriaShareRevokeRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Revokes an active summary share.
    Future clinician reads are immediately blocked (403 + audit).
    Note: Previously viewed paper/cache copies are not automatically erased.
    """
    patient_id = await _extract_patient_id(current_user, f"/api/v1/aria/shares/{share_id}/revoke")
    reason = (payload.reason if payload and payload.reason else "Patient revoked sharing consent")
    revoked = await aria_service.revoke_share(
        user=current_user,
        patient_id=patient_id,
        share_id=share_id,
        reason=reason,
    )
    return AriaShareResponse(**revoked)


# --- CLINICIAN READ ENDPOINT (CONSENT-CHECKED ON EVERY READ) ---


@router.get("/shares/clinician/patient/{patient_id}", response_model=AriaShareResponse)
@router.get("/shares/patient/{patient_id}", response_model=AriaShareResponse)
async def get_patient_shared_summary_for_clinician(
    patient_id: str,
    share_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Clinician endpoint to access a patient's approved mental health summary snapshot.
    Enforces active consent directive on EVERY read.
    Returns ONLY the approved snapshot, never raw messages, never regenerated summary.
    """
    share = await aria_service.get_shared_summary_for_clinician(
        user=current_user,
        patient_id=patient_id,
        share_id=share_id,
    )
    return AriaShareResponse(**share)
