from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

SuggestionType = Literal["approve", "reject", "requires_correction"]


class FieldDiff(BaseModel):
    field_name: str
    old_value: Optional[Any] = None
    proposed_value: Optional[Any] = None
    is_changed: bool = False
    is_new: bool = False


class EvidenceItem(BaseModel):
    field_name: str
    doc_id: Optional[str] = None
    page: Optional[int] = None
    quote: Optional[str] = None
    confidence_note: Optional[str] = None


class PriorConflict(BaseModel):
    conflict_id: str
    field_name: str
    prior_record_id: str
    prior_value: Any
    proposed_value: Any
    explanation: str


class VerificationAssistantResponse(BaseModel):
    version_id: str
    record_id: str
    patient_id: str
    missing_fields: List[str] = Field(default_factory=list)
    uncertain_fields: List[str] = Field(default_factory=list)
    conflicts_with_prior: List[PriorConflict] = Field(default_factory=list)
    old_vs_proposed_values: List[FieldDiff] = Field(default_factory=list)
    evidence: List[EvidenceItem] = Field(default_factory=list)
    reviewer_summary: str
    suggestion: SuggestionType
    suggestion_rationale: str
    disclaimer: str = "Suggestion only. Backend enforces, human verifier decides."
    agent_run_id: str
