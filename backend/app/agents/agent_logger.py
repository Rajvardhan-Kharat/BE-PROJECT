import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.agent_log_repository import agent_log_repository
from backend.app.schemas.agent_log import AgentRunLog, ToolCallRecord


class AgentRunContext:
    def __init__(
        self,
        agent_name: str,
        request_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        version_id: Optional[str] = None,
        input_refs: Optional[List[str]] = None,
    ):
        self.run_id = f"RUN-{uuid.uuid4().hex[:12].upper()}"
        self.request_id = request_id or f"REQ-{uuid.uuid4().hex[:8].upper()}"
        self.agent_name = agent_name
        self.patient_id = patient_id
        self.version_id = version_id
        self.input_refs = input_refs or []
        self.tools_called: List[ToolCallRecord] = []
        self.started_at = datetime.now(timezone.utc)
        self.start_perf = time.perf_counter()
        self.status = "started"
        self.execution_summary = ""
        self.error_message: Optional[str] = None

    def record_tool_call(
        self,
        tool_name: str,
        input_params: Dict[str, Any],
        output_summary: str,
        duration_ms: float = 0.0,
    ) -> None:
        self.tools_called.append(
            ToolCallRecord(
                tool_name=tool_name,
                input_params=input_params,
                output_summary=output_summary,
                duration_ms=round(duration_ms, 2),
            )
        )

    def add_input_ref(self, ref_id: str) -> None:
        if ref_id and ref_id not in self.input_refs:
            self.input_refs.append(ref_id)

    async def save_started(self) -> None:
        log = AgentRunLog(
            run_id=self.run_id,
            request_id=self.request_id,
            agent_name=self.agent_name,
            patient_id=self.patient_id,
            version_id=self.version_id,
            input_refs=self.input_refs,
            tools_called=self.tools_called,
            status="started",
            execution_summary="Agent execution initialized.",
            started_at=self.started_at,
        )
        await agent_log_repository.save_run(log.model_dump())

    async def complete_success(self, summary: str) -> AgentRunLog:
        self.status = "success"
        self.execution_summary = summary
        completed_at = datetime.now(timezone.utc)
        duration_ms = (time.perf_counter() - self.start_perf) * 1000.0

        log = AgentRunLog(
            run_id=self.run_id,
            request_id=self.request_id,
            agent_name=self.agent_name,
            patient_id=self.patient_id,
            version_id=self.version_id,
            input_refs=self.input_refs,
            tools_called=self.tools_called,
            status="success",
            execution_summary=summary,
            started_at=self.started_at,
            completed_at=completed_at,
            duration_ms=round(duration_ms, 2),
        )
        await agent_log_repository.save_run(log.model_dump())
        return log

    async def complete_failure(self, error: Exception) -> AgentRunLog:
        self.status = "failed"
        self.error_message = str(error)
        self.execution_summary = f"Execution failed: {str(error)}"
        completed_at = datetime.now(timezone.utc)
        duration_ms = (time.perf_counter() - self.start_perf) * 1000.0

        log = AgentRunLog(
            run_id=self.run_id,
            request_id=self.request_id,
            agent_name=self.agent_name,
            patient_id=self.patient_id,
            version_id=self.version_id,
            input_refs=self.input_refs,
            tools_called=self.tools_called,
            status="failed",
            execution_summary=self.execution_summary,
            started_at=self.started_at,
            completed_at=completed_at,
            duration_ms=round(duration_ms, 2),
            error_message=self.error_message,
        )
        await agent_log_repository.save_run(log.model_dump())
        return log
