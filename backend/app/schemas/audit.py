from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: str
    event_type: str
    user_id: Optional[str] = None
    role: Optional[str] = None
    status: str
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    timestamp: datetime
