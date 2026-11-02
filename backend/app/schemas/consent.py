from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

ConsentStatus = Literal["granted", "revoked", "expired"]
ConsentPurpose = Literal["treatment", "emergency", "research", "referral", "care_coordination", "*"]
ConsentCategory = Literal["allergies", "medications", "diagnoses", "vitals", "encounter_notes", "lab_results", "*"]


class GrantConsentRequest(BaseModel):
    patient_id: str
    purpose: str = "treatment"
    categories: List[str] = Field(default_factory=lambda: ["*"])
    recipient: str = Field(description="Hospital ID, provider ID, or '*' for general care team")
    text_version: str = "v1.0-synthetic-clinical-consent"
    effective_from: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class RevokeConsentRequest(BaseModel):
    reason: str = Field(..., min_length=5, description="Mandatory rationale for revoking consent")


class PatientConsentResponse(BaseModel):
    consent_id: str
    patient_id: str
    purpose: str
    categories: List[str]
    recipient: str
    text_version: str
    status: ConsentStatus
    effective_from: datetime
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    revocation_reason: Optional[str] = None
    granted_by: str
    created_at: datetime
    updated_at: datetime
