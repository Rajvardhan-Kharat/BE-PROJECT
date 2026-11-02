import logging
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status

logger = logging.getLogger("vericare.governance")

# Configurable verifier authority matrix:
# Maps verifier clinical specialties to authorized review specialties/departments
VERIFIER_SPECIALTY_AUTHORITY: Dict[str, List[str]] = {
    "Internal Medicine & Clinical Governance": [
        "Internal Medicine",
        "Cardiology",
        "Oncology",
        "General Medicine",
        "Emergency Medicine",
    ],
    "Cardiology": [
        "Cardiology",
        "Internal Medicine",
    ],
    "Neurology": [
        "Neurology",
        "General Medicine",
    ],
    "Oncology": [
        "Oncology",
        "Internal Medicine",
    ],
    "System Administrator": [
        "*",
    ],
}


def is_role_verifier(role: str) -> bool:
    """Only senior_doctor and system_admin hold verifier authority."""
    return role in ["senior_doctor", "system_admin"]


def check_verifier_authority(
    verifier: Dict[str, Any],
    record_specialty: str,
    record_hospital_id: str,
) -> None:
    """
    Validates that the verifier holds appropriate role, organization, and specialty authority.
    Raises HTTPException(403) with descriptive rationale on failure.
    """
    role = verifier.get("role")
    verifier_id = verifier.get("user_id")

    # 1. Role verification check
    if not is_role_verifier(role):
        logger.warning(
            "Access denied: User %s with role '%s' attempted verification action.",
            verifier_id,
            role,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{role}' lacks clinical verifier authority (senior_doctor required).",
        )

    # System admin is exempt from facility and specialty restrictions
    if role == "system_admin":
        return

    # 2. Organization / Facility scope check
    verifier_hospital = verifier.get("hospital_id") or verifier.get("scope", {}).get("hospital_id")
    if verifier_hospital and verifier_hospital != record_hospital_id:
        logger.warning(
            "Access denied: Verifier %s facility '%s' does not match record facility '%s'.",
            verifier_id,
            verifier_hospital,
            record_hospital_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Verifier hospital facility ('{verifier_hospital}') does not match record facility ('{record_hospital_id}').",
        )

    # 3. Specialty authority check
    verifier_specialty = verifier.get("specialty", "")
    allowed_specialties = VERIFIER_SPECIALTY_AUTHORITY.get(verifier_specialty, [])

    # If verifier has wildcard authority
    if "*" in allowed_specialties:
        return

    # Exact match or included in authorized list
    if record_specialty not in allowed_specialties and verifier_specialty != record_specialty:
        logger.warning(
            "Access denied: Verifier %s specialty '%s' cannot verify specialty '%s'.",
            verifier_id,
            verifier_specialty,
            record_specialty,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Verifier specialty '{verifier_specialty}' lacks clinical authority for '{record_specialty}'.",
        )


def check_self_approval_restriction(
    submitted_by: Optional[str],
    reviewer_user_id: str,
) -> None:
    """
    INVARIANT: Submitter cannot approve their own submission.
    Ensures four-eyes principle (dual authorization).
    """
    if submitted_by and submitted_by == reviewer_user_id:
        logger.warning(
            "Self-approval blocked: User %s attempted to approve own submission.",
            reviewer_user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Submitter cannot approve or review their own clinical submission (audited).",
        )
