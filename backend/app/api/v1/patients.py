from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request
from backend.app.permissions.rbac import get_current_user
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.schemas.patient import (
    EncounterResponse,
    PatientOverview,
    PatientSummary,
    PatientTimelineResponse,
    TimelineEvent,
)
from backend.app.services.patient_service import patient_service

router = APIRouter()


@router.get("/patients", response_model=List[PatientSummary])
async def search_patients(
    request: Request,
    query: Optional[str] = Query(None, description="Search term (MRN or name)"),
    hospital_id: Optional[str] = Query(None, description="Filter by hospital facility"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    Scoped patient search returning uniform list responses.
    - Clinicians see only patients within their care team scope.
    - Patients see only their own record.
    - Hospital admins see only patients within their hospital facility.
    - Prevents patient enumeration across organizational boundaries.
    """
    # Restrict hospital_id filter if caller is hospital_admin
    if current_user.get("role") == "hospital_admin":
        admin_hosp = current_user.get("scope", {}).get("hospital_id")
        if admin_hosp:
            hospital_id = admin_hosp

    # Retrieve patient IDs strictly permitted for this caller
    allowed_ids = await patient_service.get_accessible_patient_ids(current_user)

    patients = await patient_repository.search_scoped(
        allowed_patient_ids=allowed_ids,
        hospital_id=hospital_id,
        search_term=query,
        skip=skip,
        limit=limit,
    )

    return [
        PatientSummary(
            patient_id=p["patient_id"],
            mrn=p["mrn"],
            name=p["name"],
            date_of_birth=p.get("date_of_birth", "1968-04-12"),
            gender=p.get("gender", "Unknown"),
            hospital_ids=p.get("hospital_ids", []),
            care_team_ids=p.get("care_team_ids", []),
            allergies=p.get("allergies", []),
            active_consent=p.get("active_consent", True),
        )
        for p in patients
    ]


@router.get("/patients/{patient_id}", response_model=PatientOverview)
async def get_patient_overview(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns patient demographic and clinical overview.
    Enforces care-team scope for doctors and self-only scope for patients.
    Denied attempts strictly return 403 Forbidden and are logged to audit_events.
    """
    client_ip = request.client.host if request.client else None
    patient = await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )
    overview = await patient_service.get_patient_overview(patient)
    return PatientOverview(**overview)


@router.get("/patients/{patient_id}/timeline", response_model=PatientTimelineResponse)
async def get_patient_timeline(
    patient_id: str,
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns authorized clinical timeline for patient.
    Enforces scope checks before returning encounters.
    """
    client_ip = request.client.host if request.client else None
    patient = await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )

    encounters = await encounter_repository.get_patient_encounters(
        patient_id=patient_id, skip=skip, limit=limit
    )

    # Gather hospital names
    hospital_ids = list({e["hospital_id"] for e in encounters if "hospital_id" in e})
    hospitals = await organization_repository.get_by_hospital_ids(hospital_ids)
    hosp_map = {h["hospital_id"]: h["name"] for h in hospitals}

    timeline_events: List[TimelineEvent] = []
    for enc in encounters:
        hosp_name = hosp_map.get(enc.get("hospital_id"), "Medical Facility")
        timeline_events.append(
            TimelineEvent(
                event_id=enc["encounter_id"],
                event_type="clinical_encounter",
                timestamp=enc.get("admission_date", ""),
                title=f"{enc.get('encounter_type', 'Clinical')} Encounter - {enc.get('department', 'General')}",
                department=enc.get("department", "Department"),
                hospital_name=hosp_name,
                status=enc.get("status", "completed"),
                details={
                    "chief_complaint": enc.get("chief_complaint"),
                    "attending_doctor_name": enc.get("attending_doctor_name"),
                    "discharge_date": enc.get("discharge_date"),
                    "diagnosis_codes": enc.get("diagnosis_codes", []),
                },
            )
        )

    return PatientTimelineResponse(
        patient_id=patient["patient_id"],
        mrn=patient["mrn"],
        total_events=len(timeline_events),
        events=timeline_events,
    )


@router.get("/patients/{patient_id}/encounters", response_model=List[EncounterResponse])
async def get_patient_encounters(
    patient_id: str,
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Returns clinical encounters list for authorized patient."""
    client_ip = request.client.host if request.client else None
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )

    encounters = await encounter_repository.get_patient_encounters(
        patient_id=patient_id, skip=skip, limit=limit
    )

    hospitals = await organization_repository.get_by_hospital_ids(
        list({e["hospital_id"] for e in encounters if "hospital_id" in e})
    )
    hosp_map = {h["hospital_id"]: h["name"] for h in hospitals}

    return [
        EncounterResponse(
            encounter_id=e["encounter_id"],
            patient_id=e["patient_id"],
            hospital_id=e["hospital_id"],
            hospital_name=hosp_map.get(e["hospital_id"]),
            department=e["department"],
            attending_doctor_id=e.get("attending_doctor_id"),
            attending_doctor_name=e.get("attending_doctor_name"),
            encounter_type=e.get("encounter_type", "Inpatient"),
            admission_date=e.get("admission_date", ""),
            discharge_date=e.get("discharge_date"),
            status=e.get("status", "completed"),
            chief_complaint=e.get("chief_complaint", ""),
            diagnosis_codes=e.get("diagnosis_codes", []),
        )
        for e in encounters
    ]
