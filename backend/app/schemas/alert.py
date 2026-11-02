from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

AlertType = Literal["data_inconsistency", "potential_clinical_concern"]
AlertStatus = Literal["open", "dismissed", "resolved"]


class AlertEvidenceRef(BaseModel):
    ref_type: str = Field(..., description="e.g. prescription, encounter, allergy, record_version")
    ref_id: str = Field(..., description="ID of the referenced clinical item")
    description: str = Field(..., description="Human-readable description of evidence snippet")
    data: Optional[Dict[str, Any]] = None


class ClinicalAlertResponse(BaseModel):
    alert_id: str
    patient_id: str
    rule_id: str
    rule_version: str
    source: str
    type: AlertType
    title: str
    evidence_refs: List[AlertEvidenceRef] = Field(default_factory=list)
    explanation: str
    status: AlertStatus
    dismissed_by: Optional[str] = None
    dismissed_reason: Optional[str] = None
    dismissed_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_reason: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AlertActionRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Mandatory rationale for dismissing or resolving an alert")


class PrescriptionSchema(BaseModel):
    prescription_id: str
    patient_id: str
    encounter_id: Optional[str] = None
    record_id: Optional[str] = None
    drug_name: str
    dosage: str
    frequency: str
    route: str = "PO"
    duration_days: Optional[int] = None
    status: Literal["active", "discontinued", "completed", "held"] = "active"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    prescribed_by: Optional[str] = None
    hospital_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class SafetyCheckResult(BaseModel):
    patient_id: str
    rules_evaluated: int
    rule_set_label: str = "synthetic demonstration rules"
    rule_set_version: str = "1.0.0"
    total_alerts: int
    new_alerts: int
    alerts: List[ClinicalAlertResponse]
