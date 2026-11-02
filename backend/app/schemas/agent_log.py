from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

AgentStatus = Literal["started", "success", "failed"]


class ToolCallRecord(BaseModel):
    tool_name: str
    input_params: Dict[str, Any] = Field(default_factory=dict)
    output_summary: str
    duration_ms: float = 0.0


class AgentRunLog(BaseModel):
    run_id: str
    request_id: str
    agent_name: str
    patient_id: Optional[str] = None
    version_id: Optional[str] = None
    input_refs: List[str] = Field(default_factory=list)
    tools_called: List[ToolCallRecord] = Field(default_factory=list)
    status: AgentStatus = "started"
    execution_summary: str = ""
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[float] = None
    error_message: Optional[str] = None
