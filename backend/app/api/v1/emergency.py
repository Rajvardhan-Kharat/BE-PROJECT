from fastapi import APIRouter, Depends, HTTPException, Request, status
from backend.app.agents.emergency_summary_agent import emergency_summary_agent
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.emergency_summary import EmergencySummaryResponse
from backend.app.services.patient_service import patient_service

router = APIRouter()


@router.get("/patients/{patient_id}/emergency-summary", response_model=EmergencySummaryResponse)
async def get_patient_emergency_summary(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Emergency Summary Profile:
    Assembled strictly from approved records with sections:
    - Verified (approved diagnoses, active meds, confirmed allergies with source links)
    - Pending (quarantined proposals)
    - Conflicting (active cross-facility conflicts)
    - Missing-or-stale (INVARIANT: missing is NEVER shown as negative; empty allergy shows 'unavailable')
    """
    client_ip = request.client.host if request.client else None

    # Scope check: patient sees self; clinician sees care-team patients
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )

    req_id = request.headers.get("X-Request-ID")
    try:
        return await emergency_summary_agent.assemble_emergency_summary(
            patient_id=patient_id,
            request_id=req_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
