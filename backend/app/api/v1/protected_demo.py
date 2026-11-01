from fastapi import APIRouter, Depends
from backend.app.permissions.rbac import require

router = APIRouter()


@router.get("/protected/verifier-only")
async def verifier_endpoint(
    current_user: dict = Depends(require("records:verify", required_scope="care_team")),
):
    """Accessible only to senior_doctor (verifier) with care team scope."""
    return {
        "status": "authorized",
        "message": "Senior verifier access granted for care team record verification.",
        "user_id": current_user["user_id"],
        "role": current_user["role"],
    }


@router.get("/protected/doctor-action")
async def doctor_endpoint(
    current_user: dict = Depends(require("notes:write", required_scope="care_team")),
):
    """Accessible to doctor and senior_doctor with care team scope."""
    return {
        "status": "authorized",
        "message": "Doctor clinical note authoring access granted.",
        "user_id": current_user["user_id"],
        "role": current_user["role"],
    }


@router.get("/protected/admin-only")
async def admin_endpoint(
    current_user: dict = Depends(require("system:manage")),
):
    """Accessible only to system_admin."""
    return {
        "status": "authorized",
        "message": "System administration access granted.",
        "user_id": current_user["user_id"],
        "role": current_user["role"],
    }
