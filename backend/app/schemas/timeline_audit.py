from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

ConflictType = Literal[
    "stale_import_reintroduction",
    "medication_status_contradiction",
    "dosing_inconsistency",
    "date_inconsistency",
    "duplicate_order",
]

ConflictStatus = Literal["unresolved", "resolved"]


class ConflictEventRef(BaseModel):
    event_id: str
    event_type: str
    date: str
    source: str
    hospital_id: str
    hospital_name: str
    department: str
    provider_name: Optional[str] = None
    status: str
    details: Dict[str, Any] = Field(default_factory=dict)


class ConflictMarker(BaseModel):
    conflict_id: str
    rule_id: str
    label: str
    type: ConflictType
    explanation: str
    warning: str


class TimelineConflict(BaseModel):
    conflict_id: str
    patient_id: str
    conflict_type: ConflictType
    rule_id: str
    entity_key: str
    title: str
    explanation: str
    warning: str
    dates: List[str]
    sources: List[str]
    events_involved: List[ConflictEventRef]
    status: ConflictStatus = "unresolved"
    resolution: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AuditedTimelineEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: str
    title: str
    department: str
    hospital_id: str
    hospital_name: str
    provider_name: Optional[str] = None
    status: str
    has_conflict: bool = False
    conflict_markers: List[ConflictMarker] = Field(default_factory=list)
    details: Dict[str, Any] = Field(default_factory=dict)


class TimelineAuditReport(BaseModel):
    patient_id: str
    mrn: str
    patient_name: str
    total_events: int
    conflicts_count: int
    unresolved_conflicts_count: int
    hospitals_involved: List[Dict[str, str]]
    departments_involved: List[str]
    conflicts: List[TimelineConflict]
    timeline: List[AuditedTimelineEvent]


class TimelineConflictResolveRequest(BaseModel):
    resolution_action: str = Field(
        ...,
        description="Clinical decision: confirm_discontinuation, maintain_active, accept_imported_status, or custom_clinical_override",
    )
    reason: str = Field(
        ...,
        min_length=3,
        description="Mandatory clinical rationale for resolving timeline conflict",
    )
