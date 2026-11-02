from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request
from backend.app.permissions.rbac import get_current_user
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_notification_repository import patient_notification_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.schemas.access_log import PatientAccessLogResponse
from backend.app.schemas.patient import (
    EncounterResponse,
    PatientOverview,
    PatientSummary,
    PatientTimelineResponse,
    TimelineEvent,
)
from backend.app.schemas.patient_notification import PatientNotificationResponse
from backend.app.schemas.verification import RecordVersionResponse
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

    # INVARIANT: Only APPROVED data appears in the trusted timeline.
    # Pending proposals and unverified extracts are strictly excluded.
    approved_records = await record_version_repository.get_patient_approved_records(
        patient_id=patient_id, skip=skip, limit=limit
    )

    # Gather hospital names
    hospital_ids = list({e["hospital_id"] for e in encounters if "hospital_id" in e})
    for r in approved_records:
        if r.get("hospital_id") and r["hospital_id"] not in hospital_ids:
            hospital_ids.append(r["hospital_id"])

    hospitals = await organization_repository.get_by_hospital_ids(hospital_ids)
    hosp_map = {h["hospital_id"]: h["name"] for h in hospitals}

    timeline_events: List[TimelineEvent] = []

    # 1. Add encounters
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

    # 2. Add approved verified clinical records
    for rec in approved_records:
        hosp_name = hosp_map.get(rec.get("hospital_id"), "Medical Facility")
        ts = rec.get("clinical_timestamp")
        if not ts and rec.get("reviewed_at"):
            ts = rec["reviewed_at"].strftime("%Y-%m-%d %H:%M")
        timeline_events.append(
            TimelineEvent(
                event_id=rec["version_id"],
                event_type="verified_clinical_record",
                timestamp=ts or "",
                title=f"Verified Record: {rec.get('title', 'Clinical Record')} (v{rec.get('version_number', 1)})",
                department=rec.get("department", "Department"),
                hospital_name=hosp_name,
                status="approved",
                details={
                    "record_id": rec["record_id"],
                    "version_number": rec.get("version_number", 1),
                    "record_type": rec.get("record_type", "general"),
                    "reviewed_by": rec.get("reviewer_name") or rec.get("reviewed_by"),
                    "reviewed_at": rec.get("reviewed_at").isoformat() if rec.get("reviewed_at") else None,
                    "data": rec.get("data", {}),
                },
            )
        )

    # Sort descending by timestamp
    timeline_events.sort(key=lambda x: x.timestamp or "", reverse=True)

    return PatientTimelineResponse(
        patient_id=patient["patient_id"],
        mrn=patient["mrn"],
        total_events=len(timeline_events),
        events=timeline_events,
    )


@router.get("/patients/{patient_id}/pending-records", response_model=List[RecordVersionResponse])
async def get_patient_pending_records(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns clinical proposals currently awaiting verification or requiring correction.
    INVARIANT: Displayed in a separate section from the trusted clinical timeline.
    """
    client_ip = request.client.host if request.client else None
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )
    records = await record_version_repository.get_patient_pending_records(patient_id)
    return [RecordVersionResponse(**r) for r in records]


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


@router.get("/patients/{patient_id}/access-log", response_model=PatientAccessLogResponse)
async def get_patient_access_log(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Transparent patient access audit log:
    Shows all individuals and systems that accessed this patient record,
    with prominence given to break-glass emergency overrides and consent revocations.
    """
    result = await patient_service.get_patient_access_log(patient_id=patient_id, user=current_user)
    return PatientAccessLogResponse(**result)


@router.get("/patients/{patient_id}/notifications", response_model=List[PatientNotificationResponse])
async def list_patient_notifications(
    patient_id: str,
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    In-app patient notification feed (break-glass alerts, consent revocation confirmations).
    """
    # Enforce patient self or authorized scope
    if current_user.get("role") == "patient" and current_user.get("scope", {}).get("patient_id") != patient_id:
        return []

    notifications = await patient_notification_repository.list_for_patient(
        patient_id=patient_id, skip=skip, limit=limit
    )
    return [PatientNotificationResponse(**n) for n in notifications]


@router.post("/patients/{patient_id}/notifications/{notification_id}/read", response_model=Optional[PatientNotificationResponse])
async def mark_patient_notification_read(
    patient_id: str,
    notification_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Marks an in-app patient notification as read.
    """
    if current_user.get("role") == "patient" and current_user.get("scope", {}).get("patient_id") != patient_id:
        return None

    updated = await patient_notification_repository.mark_as_read(
        notification_id=notification_id, patient_id=patient_id
    )
    return PatientNotificationResponse(**updated) if updated else None
