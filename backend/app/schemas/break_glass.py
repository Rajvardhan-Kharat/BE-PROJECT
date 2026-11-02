from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.emergency_summary import EmergencySummaryResponse

BreakGlassReasonCategory = Literal[
    "acute_resuscitation",
    "unconscious_patient",
    "trauma_stat",
    "immediate_threat_to_life",
    "missing_critical_history",
]

BreakGlassSessionStatus = Literal["active", "expired", "revoked"]
BreakGlassReviewStatus = Literal["pending_review", "justified", "questioned"]


class BreakGlassRequest(BaseModel):
    patient_id: str
    justification: str = Field(
        ...,
        min_length=10,
        max_length=1000,
        description="Mandatory clinical justification explaining why emergency break-glass override is necessary.",
    )
    reason_category: BreakGlassReasonCategory = Field(
        ...,
        description="Standardized clinical urgency classification category.",
    )
    duration_minutes: Optional[int] = Field(
        default=60,
        ge=5,
        le=240,
        description="Requested emergency access duration (default 60 minutes).",
    )


class BreakGlassAdminReviewRequest(BaseModel):
    review_status: Literal["justified", "questioned"] = Field(
        ...,
        description="Administrative review determination regarding clinical legitimacy of the override.",
    )
    review_notes: str = Field(
        ...,
        min_length=5,
        max_length=1000,
        description="Mandatory administrative rationale documenting justification or reasons for questioning.",
    )


class BreakGlassSessionResponse(BaseModel):
    session_id: str
    patient_id: str
    clinician_id: str
    clinician_name: str
    clinician_role: str
    hospital_id: str
    justification: str
    reason_category: BreakGlassReasonCategory
    status: BreakGlassSessionStatus
    review_status: BreakGlassReviewStatus
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    granted_at: datetime
    expires_at: datetime
    remaining_minutes: Optional[int] = None
    access_scope: str = "EMERGENCY_SUMMARY_ONLY"


class BreakGlassEmergencyViewResponse(BaseModel):
    session_id: str
    patient_id: str
    patient_name: str
    mrn: str
    date_of_birth: str
    blood_type: str
    session_expires_at: datetime
    remaining_minutes: int
    summary: EmergencySummaryResponse
    allergies: List[Any] = Field(default_factory=list)
    active_medications: List[Dict[str, Any]] = Field(default_factory=list)
    disclaimer: str = (
        "BREAK-GLASS EMERGENCY OVERRIDE: Limited emergency clinical profile. "
        "All access actions are immutably audited and reported to hospital administration and the patient. "
        "Access to raw OCR documents and private notes is strictly prohibited."
    )
