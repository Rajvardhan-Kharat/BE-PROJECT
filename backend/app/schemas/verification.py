from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


RecordStatusType = Literal[
    "draft",
    "pending_review",
    "approved",
    "rejected",
    "superseded",
    "requires_correction",
]

DecisionType = Literal["approved", "rejected", "requires_correction"]


class SourceSpanSchema(BaseModel):
    doc: str
    page: int
    start: int
    end: int
    quote: str


class ExtractedFieldItem(BaseModel):
    field_name: str
    value: Any
    confidence_note: str = ""
    status: Literal["explicit", "inferred", "uncertain", "missing", "conflicting"] = "explicit"
    source_span: Optional[SourceSpanSchema] = None
    grounding_verified: bool = True
    human_correction: Optional[Dict[str, Any]] = None


class SubmitRecordRequest(BaseModel):
    patient_id: str
    record_id: Optional[str] = None  # None for new record, provided when proposing update
    record_type: str = Field(..., description="e.g. discharge_summary, diagnosis, medication_reconciliation")
    title: str = Field(..., description="Short title e.g. Cardiology Discharge Summary")
    department: str = Field(..., description="Specialty/Department e.g. Cardiology")
    hospital_id: str
    care_team_id: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict, description="Structured clinical fields")
    source_document_id: Optional[str] = None
    source_text_snippet: Optional[str] = None
    extracted_fields: List[Dict[str, Any]] = Field(default_factory=list)
    clinical_timestamp: Optional[str] = Field(None, description="ISO timestamp of clinical encounter/event")


class VerificationDecisionRequest(BaseModel):
    decision: DecisionType
    reason: Optional[str] = Field(None, description="Mandatory for rejected and requires_correction")
    human_modifications: Optional[Dict[str, Any]] = Field(None, description="Optional verified corrections to clinical data")


class RecordVersionResponse(BaseModel):
    version_id: str
    record_id: str
    patient_id: str
    version_number: int
    status: RecordStatusType
    record_type: str
    title: str
    department: str
    hospital_id: str
    care_team_id: Optional[str] = None
    data: Dict[str, Any]
    source_document_id: Optional[str] = None
    source_text_snippet: Optional[str] = None
    extracted_fields: List[Dict[str, Any]] = Field(default_factory=list)
    submitted_by: Optional[str] = None
    submitter_name: Optional[str] = None
    submitted_at: datetime
    reviewed_by: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_decision: Optional[str] = None
    review_reason: Optional[str] = None
    superseded_by: Optional[str] = None
    superseded_at: Optional[datetime] = None
    clinical_timestamp: Optional[str] = None
    created_at: datetime


class VerificationQueueItem(BaseModel):
    version_id: str
    record_id: str
    patient_id: str
    patient_name: str
    mrn: str
    version_number: int
    status: RecordStatusType
    record_type: str
    title: str
    department: str
    hospital_id: str
    hospital_name: Optional[str] = None
    submitter_name: Optional[str] = None
    submitted_by: Optional[str] = None
    submitted_at: datetime
    review_reason: Optional[str] = None
    fields_count: int = 0
    has_prior_approved: bool = False


class RecordComparisonResponse(BaseModel):
    proposed_version: RecordVersionResponse
    current_approved_version: Optional[RecordVersionResponse] = None
    patient_name: str
    mrn: str
    hospital_name: str
    field_diffs: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of field differences: {field, current_val, proposed_val, change_type: 'added'|'modified'|'unchanged'|'removed'}",
    )
    can_current_user_approve: bool = True
    restriction_reason: Optional[str] = None


class RecordHistoryItem(BaseModel):
    version_id: str
    record_id: str
    version_number: int
    status: RecordStatusType
    title: str
    data: Dict[str, Any]
    submitted_by: Optional[str] = None
    submitter_name: Optional[str] = None
    submitted_at: datetime
    reviewed_by: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_decision: Optional[str] = None
    review_reason: Optional[str] = None
    superseded_by: Optional[str] = None
    superseded_at: Optional[datetime] = None


class RecordHistoryResponse(BaseModel):
    record_id: str
    patient_id: str
    patient_name: str
    total_versions: int
    versions: List[RecordHistoryItem]
