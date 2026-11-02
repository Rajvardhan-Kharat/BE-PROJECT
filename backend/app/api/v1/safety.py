from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Request
from backend.app.permissions.rbac import get_current_user
from backend.app.repositories.prescription_repository import prescription_repository
from backend.app.schemas.alert import (
    AlertActionRequest,
    ClinicalAlertResponse,
    PrescriptionSchema,
    SafetyCheckResult,
)
from backend.app.services.clinical_safety_service import clinical_safety_service
from backend.app.services.patient_service import patient_service

router = APIRouter()


@router.post("/patients/{patient_id}/safety/run-checks", response_model=SafetyCheckResult)
async def run_safety_checks(
    patient_id: str,
    request: Request,
    custom_prescriptions: Optional[List[Dict[str, Any]]] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Evaluates 5 deterministic safety and consistency rules for the patient:
    1. Duplicate active prescriptions
    2. Allergy vs medication contraindications
    3. Listed drug-drug interactions (~15 pairs)
    4. Contradictory status across encounters
    5. Dosage / duration inconsistencies
    """
    client_ip = request.client.host if request.client else None
    return await clinical_safety_service.run_safety_checks(
        patient_id=patient_id,
        current_user=current_user,
        custom_prescriptions=custom_prescriptions,
        client_ip=client_ip,
    )


@router.get("/patients/{patient_id}/safety/alerts", response_model=List[ClinicalAlertResponse])
async def list_patient_alerts(
    patient_id: str,
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (open, dismissed, resolved, all)"),
    type: Optional[str] = Query(None, description="Filter by alert type (data_inconsistency, potential_clinical_concern)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Lists clinical safety alerts for patient with evidence references and rule IDs.
    """
    client_ip = request.client.host if request.client else None
    return await clinical_safety_service.get_patient_alerts(
        patient_id=patient_id,
        current_user=current_user,
        status_filter=status,
        type_filter=type,
        client_ip=client_ip,
    )


@router.post("/safety/alerts/{alert_id}/dismiss", response_model=ClinicalAlertResponse)
async def dismiss_alert(
    alert_id: str,
    payload: AlertActionRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Dismisses a safety alert. Clinical reason is strictly mandatory.
    """
    client_ip = request.client.host if request.client else None
    return await clinical_safety_service.dismiss_alert(
        alert_id=alert_id,
        reason=payload.reason,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.post("/safety/alerts/{alert_id}/resolve", response_model=ClinicalAlertResponse)
async def resolve_alert(
    alert_id: str,
    payload: AlertActionRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Resolves a safety alert following remediation. Clinical reason is strictly mandatory.
    """
    client_ip = request.client.host if request.client else None
    return await clinical_safety_service.resolve_alert(
        alert_id=alert_id,
        reason=payload.reason,
        current_user=current_user,
        client_ip=client_ip,
    )


@router.get("/patients/{patient_id}/prescriptions", response_model=List[PrescriptionSchema])
async def list_patient_prescriptions(
    patient_id: str,
    request: Request,
    status: Optional[str] = Query(None, description="Filter by prescription status (active, discontinued, completed)"),
    current_user: dict = Depends(get_current_user),
):
    """Lists current and historical prescriptions for authorized patient."""
    client_ip = request.client.host if request.client else None
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )

    prescriptions = await prescription_repository.get_by_patient(patient_id=patient_id, status=status)
    if not prescriptions:
        # Fallback to extract from approved record versions if not seeded directly
        extracted = await clinical_safety_service._extract_medications_from_records(patient_id)
        return [PrescriptionSchema(**rx) for rx in extracted]

    return [PrescriptionSchema(**rx) for rx in prescriptions]
