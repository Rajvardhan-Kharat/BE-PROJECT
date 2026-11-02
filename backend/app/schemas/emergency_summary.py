from typing import List, Optional
from pydantic import BaseModel, Field


class VerifiedItem(BaseModel):
    category: str = Field(..., description="allergies, active_medications, critical_diagnoses, vitals")
    label: str
    details: str
    source_record_id: str
    source_version_id: str
    hospital_name: str
    reviewed_by: str
    reviewed_at: Optional[str] = None


class PendingItem(BaseModel):
    category: str
    label: str
    proposed_value: str
    source_version_id: str
    submitted_by: str
    submitted_at: str
    status: str
    quarantine_warning: str = "UNVERIFIED PROPOSAL - Quarantined from trusted emergency profile"


class ConflictingItem(BaseModel):
    conflict_id: str
    entity: str
    conflict_type: str
    explanation: str
    sources_involved: List[str]
    warning: str = "Active multi-facility conflict. Do NOT assume newest is correct."


class MissingOrStaleItem(BaseModel):
    category: str
    item_name: str
    status_display: str
    notes: str
    last_known_date: Optional[str] = None


class EmergencySummaryResponse(BaseModel):
    patient_id: str
    mrn: str
    patient_name: str
    date_of_birth: str
    gender: str
    blood_type: str
    last_updated_time: str
    compiled_at: str
    verified: List[VerifiedItem] = Field(default_factory=list)
    pending: List[PendingItem] = Field(default_factory=list)
    conflicting: List[ConflictingItem] = Field(default_factory=list)
    missing_or_stale: List[MissingOrStaleItem] = Field(default_factory=list)
    agent_run_id: str
