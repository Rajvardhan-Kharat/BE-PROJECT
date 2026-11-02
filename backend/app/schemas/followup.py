from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class MedicationCourseDetails(BaseModel):
    medication_name: str
    dosage: str
    prescribed_days: int
    start_date: str
    expected_end_date: str
    refills_authorized: int = 0
    instructions: Optional[str] = None


class StatusTransitionAudit(BaseModel):
    from_status: str
    to_status: str
    reason: str
    changed_by: str
    changed_at: str


class FollowUpCreateRequest(BaseModel):
    patient_id: str
    type: str = Field(..., description="appointment | medication_course | lab_test | imaging")
    title: str
    description: Optional[str] = None
    due_date: str = Field(..., description="YYYY-MM-DD target due date")
    scheduled_date: Optional[str] = None
    care_team_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    medication_details: Optional[MedicationCourseDetails] = None


class FollowUpStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="upcoming | overdue | completed | deferred | needs_review")
    reason: str = Field(..., min_length=3, description="Mandatory clinical rationale for status change")
    new_due_date: Optional[str] = Field(None, description="Required when status is deferred (YYYY-MM-DD)")


class FollowUpResponse(BaseModel):
    follow_up_id: str
    patient_id: str
    type: str
    title: str
    description: Optional[str] = None
    due_date: str
    scheduled_date: Optional[str] = None
    completed_date: Optional[str] = None
    status: str
    days_overdue_or_remaining: int
    care_team_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    medication_details: Optional[MedicationCourseDetails] = None
    # Mandatory clinical guardrail: Never infer adherence
    adherence_inferred: bool = False
    clinical_safety_note: str = "Deterministic schedule tracking only. Adherence is never inferred."
    audit_history: List[StatusTransitionAudit] = []
    created_at: str
    updated_at: str


class FollowUpEvaluationResult(BaseModel):
    patient_id: str
    evaluation_timestamp: str
    total_tracked: int
    upcoming_count: int
    overdue_count: int
    needs_review_count: int
    completed_count: int
    deferred_count: int
    adherence_inferred: bool = False
    summary: str
