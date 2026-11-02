from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel

AccessType = Literal["standard", "break_glass_emergency", "consent_revocation", "access_denied"]


class PatientAccessLogEntry(BaseModel):
    log_id: str
    timestamp: datetime
    accessor_id: Optional[str] = None
    accessor_name: Optional[str] = None
    accessor_role: Optional[str] = None
    access_type: AccessType
    resource_accessed: str
    purpose: Optional[str] = None
    break_glass_justification: Optional[str] = None
    break_glass_reason_category: Optional[str] = None
    break_glass_session_id: Optional[str] = None
    status: str
    ip_address: Optional[str] = None


class PatientAccessLogResponse(BaseModel):
    patient_id: str
    total_accesses: int
    break_glass_accesses_count: int
    entries: List[PatientAccessLogEntry]
