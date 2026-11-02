from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class AriaSessionCreate(BaseModel):
    title: Optional[str] = Field(None, description="Optional custom session title")


class AriaSessionResponse(BaseModel):
    session_id: str
    session_ref: Optional[str] = None
    patient_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0

    @model_validator(mode="after")
    def populate_session_ref(self):
        if not self.session_ref:
            self.session_ref = self.session_id
        return self


class AriaMessageCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000, description="Patient message text")


class AriaMessageResponse(BaseModel):
    message_id: str
    session_id: str
    session_ref: Optional[str] = None
    patient_id: str
    sender: Literal["user", "companion", "system_safety"]
    text: str
    safety_event: bool = False
    provider_name: str
    created_at: str
    crisis_guidance: Optional[str] = None
    crisis_resources: Optional[List[Dict[str, Any]]] = None

    @model_validator(mode="after")
    def populate_session_ref(self):
        if not self.session_ref:
            self.session_ref = self.session_id
        return self


class AriaDraftSummaryRequest(BaseModel):
    pass


class AriaDraftSummaryResponse(BaseModel):
    session_id: str
    session_ref: Optional[str] = None
    draft_text: str
    provider_name: Optional[str] = "MOCK"

    @model_validator(mode="after")
    def populate_session_ref(self):
        if not self.session_ref:
            self.session_ref = self.session_id
        return self


class AriaShareCreate(BaseModel):
    recipient_id: str = Field(..., description="Target clinician or care team identifier")
    recipient_name: Optional[str] = Field(None, description="Target clinician or care team display name")
    summary_text: Optional[str] = Field(None, description="Patient-reviewed summary snapshot")
    approved_text: Optional[str] = Field(None, description="Alias for summary_text")
    session_ref: Optional[str] = Field(None, description="Optional session reference")
    purpose: str = Field("mental_health_care_coordination", description="Sharing purpose directive")

    @model_validator(mode="after")
    def validate_text(self):
        if not self.summary_text and not self.approved_text:
            raise ValueError("Either summary_text or approved_text must be provided")
        if not self.summary_text:
            self.summary_text = self.approved_text
        if not self.approved_text:
            self.approved_text = self.summary_text
        if not self.recipient_name:
            self.recipient_name = self.recipient_id
        return self


class AriaShareResponse(BaseModel):
    share_id: str
    summary_id: Optional[str] = None
    patient_id: str
    recipient_id: str
    recipient_name: Optional[str] = None
    summary_text: Optional[str] = None
    approved_text: Optional[str] = None
    status: Literal["active", "revoked"]
    consent_version: Optional[str] = "v1.0"
    shared_at: Optional[str] = None
    created_at: Optional[str] = None
    revoked_at: Optional[str] = None
    revocation_reason: Optional[str] = None

    @model_validator(mode="after")
    def populate_aliases(self):
        if not self.summary_id:
            self.summary_id = self.share_id
        if not self.approved_text:
            self.approved_text = self.summary_text
        if not self.summary_text:
            self.summary_text = self.approved_text
        if not self.created_at and self.shared_at:
            self.created_at = self.shared_at
        if not self.shared_at and self.created_at:
            self.shared_at = self.created_at
        return self


class AriaShareRevokeRequest(BaseModel):
    reason: Optional[str] = Field("Patient revoked sharing consent", description="Rationale for revocation")


class AriaNoticeStatusResponse(BaseModel):
    acknowledged: bool
    provider_label: str
    mode: str
    disclaimer_text: Optional[str] = (
        "Aria is an automated companion and journal assistant. It is not a licensed physician or diagnostic instrument."
    )
    acknowledged_at: Optional[str] = None
