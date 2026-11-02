from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------
# Second Memory: Clinical Notes & Search
# ---------------------------------------------------------

class NoteCitation(BaseModel):
    record_id: str
    record_type: str
    date: str
    snippet: str


class ClinicalNoteCreate(BaseModel):
    patient_id: str
    title: str = Field(..., min_length=2)
    content: str = Field(..., min_length=5)
    is_private: bool = Field(False, description="True = author-only; False = shared with care team")
    tags: List[str] = Field(default_factory=list)
    citations: List[NoteCitation] = Field(default_factory=list)


class ClinicalNoteResponse(BaseModel):
    note_id: str
    patient_id: str
    author_id: str
    author_name: str
    author_role: str
    specialty: str
    title: str
    content: str
    is_private: bool
    tags: List[str]
    citations: List[NoteCitation]
    created_at: str
    updated_at: str


class CitedSummaryRequest(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    topic: Optional[str] = None


class CitedSummaryRecordRef(BaseModel):
    note_id: str
    author_name: str
    specialty: str
    date: str
    snippet: str


class CitedSummaryResponse(BaseModel):
    patient_id: str
    date_range: Dict[str, Optional[str]]
    topic_filter: Optional[str] = None
    summary_text: str
    cited_records: List[CitedSummaryRecordRef]
    total_notes_analyzed: int
    generated_at: str


# ---------------------------------------------------------
# Care-Team Workspace: Clinical Tasks
# ---------------------------------------------------------

class ClinicalTaskCreate(BaseModel):
    patient_id: str
    title: str = Field(..., min_length=3)
    description: Optional[str] = None
    assigned_to: str = Field(..., description="user_id of care-team clinician")
    priority: str = Field("medium", description="low | medium | high | urgent")
    due_date: str = Field(..., description="YYYY-MM-DD")


class ClinicalTaskUpdate(BaseModel):
    status: Optional[str] = Field(None, description="pending | in_progress | completed | cancelled")
    notes: Optional[str] = None


class ClinicalTaskResponse(BaseModel):
    task_id: str
    patient_id: str
    title: str
    description: Optional[str] = None
    assigned_to: str
    assigned_to_name: str
    assigned_by: str
    assigned_by_name: str
    priority: str
    due_date: str
    status: str
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------
# Questions Between Specialists
# ---------------------------------------------------------

class SpecialistQueryReplyCreate(BaseModel):
    answer: str = Field(..., min_length=3)


class SpecialistQueryResponseItem(BaseModel):
    response_id: str
    doctor_id: str
    doctor_name: str
    specialty: str
    answer: str
    created_at: str


class SpecialistQueryCreate(BaseModel):
    patient_id: str
    to_doctor_id: Optional[str] = None
    to_specialty: str = Field(..., description="Specialty of recipient e.g. Nephrology, Cardiology")
    subject: str = Field(..., min_length=3)
    question: str = Field(..., min_length=5)
    priority: str = Field("routine", description="routine | urgent")


class SpecialistQueryResponse(BaseModel):
    query_id: str
    patient_id: str
    from_doctor_id: str
    from_doctor_name: str
    from_specialty: str
    to_doctor_id: Optional[str] = None
    to_doctor_name: Optional[str] = None
    to_specialty: str
    subject: str
    question: str
    priority: str
    status: str = Field("open", description="open | answered | closed")
    responses: List[SpecialistQueryResponseItem] = []
    created_at: str
    updated_at: str


# ---------------------------------------------------------
# In-App Notifications
# ---------------------------------------------------------

class NotificationResponse(BaseModel):
    notification_id: str
    recipient_id: str
    patient_id: Optional[str] = None
    type: str = Field(..., description="task_assigned | specialist_query | query_answered | followup_overdue")
    title: str
    message: str
    link: Optional[str] = None
    read: bool
    created_at: str


class NotificationsListResponse(BaseModel):
    notifications: List[NotificationResponse]
    unread_count: int
