from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.consent import (
    GrantConsentRequest,
    PatientConsentResponse,
    RevokeConsentRequest,
)
from backend.app.services.consent_service import consent_service

router = APIRouter()


@router.post("/patients/{patient_id}/consent", response_model=PatientConsentResponse)
async def grant_patient_consent(
    patient_id: str,
    payload: GrantConsentRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Grants a clinical data sharing consent directive.
    Specifies purpose, categories, recipient, text version, and effective timeframe.
    """
    client_ip = request.client.host if request.client else None
    result = await consent_service.grant_consent(
        patient_id=patient_id,
        user=current_user,
        recipient=payload.recipient,
        purpose=payload.purpose,
        categories=payload.categories,
        text_version=payload.text_version,
        effective_from=payload.effective_from,
        expires_at=payload.expires_at,
        client_ip=client_ip,
    )
    return PatientConsentResponse(**result)


@router.post("/patients/{patient_id}/consent/{consent_id}/revoke", response_model=PatientConsentResponse)
async def revoke_patient_consent(
    patient_id: str,
    consent_id: str,
    payload: RevokeConsentRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Revokes an active clinical consent directive with mandatory reason.
    Immediately blocks non-emergency sharing with the specified recipient / categories.
    """
    client_ip = request.client.host if request.client else None
    result = await consent_service.revoke_consent(
        consent_id=consent_id,
        user=current_user,
        reason=payload.reason,
        client_ip=client_ip,
    )
    return PatientConsentResponse(**result)


@router.get("/patients/{patient_id}/consents", response_model=List[PatientConsentResponse])
async def list_patient_consents(
    patient_id: str,
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (granted, revoked, expired)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Lists all consent directives for a patient.
    """
    results = await consent_service.list_consents_for_patient(
        patient_id=patient_id,
        user=current_user,
        status=status,
    )
    return [PatientConsentResponse(**c) for c in results]
