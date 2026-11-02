from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class AgentLogRepository(BaseRepository):
    collection_name = "agent_execution_logs"

    async def get_by_run_id(self, run_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"run_id": run_id})

    async def get_by_request_id(self, request_id: str) -> List[Dict[str, Any]]:
        return await self.find_many(query={"request_id": request_id}, sort=[("started_at", -1)])

    async def list_runs(
        self,
        agent_name: Optional[str] = None,
        status: Optional[str] = None,
        patient_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if agent_name:
            query["agent_name"] = agent_name
        if status:
            query["status"] = status
        if patient_id:
            query["patient_id"] = patient_id
        return await self.find_many(query=query, skip=skip, limit=limit, sort=[("started_at", -1)])

    async def save_run(self, run_data: Dict[str, Any]) -> str:
        run_id = run_data["run_id"]
        existing = await self.find_one({"run_id": run_id})
        if existing:
            await self.update_one({"run_id": run_id}, run_data)
        else:
            await self.create(run_data)
        return run_id


agent_log_repository = AgentLogRepository()
