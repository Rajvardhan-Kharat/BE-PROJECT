from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel


class PatientNotificationResponse(BaseModel):
    notification_id: str
    patient_id: str
    type: str
    priority: str
    title: str
    message: str
    read: bool = False
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = None
