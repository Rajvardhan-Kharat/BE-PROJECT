from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class TimelineConflictRepository(BaseRepository):
    collection_name = "timeline_conflicts"

    async def get_by_conflict_id(self, conflict_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"conflict_id": conflict_id})

    async def get_by_patient(
        self, patient_id: str, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"patient_id": patient_id}
        if status:
            query["status"] = status
        return await self.find_many(query=query, sort=[("created_at", -1)])

    async def upsert_conflict(self, conflict: Dict[str, Any]) -> str:
        conflict_id = conflict["conflict_id"]
        existing = await self.find_one({"conflict_id": conflict_id})
        now = datetime.now(timezone.utc)
        if existing:
            # Preserve existing resolution if already resolved by human
            if existing.get("status") == "resolved":
                conflict["status"] = "resolved"
                conflict["resolution"] = existing.get("resolution")
                conflict["resolved_by"] = existing.get("resolved_by")
                conflict["resolved_at"] = existing.get("resolved_at")
                conflict["resolved_reason"] = existing.get("resolved_reason")
            conflict["updated_at"] = now
            await self.update_one({"conflict_id": conflict_id}, conflict)
        else:
            conflict["created_at"] = now
            conflict["updated_at"] = now
            await self.create(conflict)
        return conflict_id

    async def resolve_conflict(
        self,
        conflict_id: str,
        resolution_action: str,
        reason: str,
        resolved_by: str,
    ) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        update_data = {
            "status": "resolved",
            "resolution": resolution_action,
            "resolved_reason": reason,
            "resolved_by": resolved_by,
            "resolved_at": now,
            "updated_at": now,
        }
        success = await self.update_one({"conflict_id": conflict_id}, update_data)
        if success:
            return await self.find_one({"conflict_id": conflict_id})
        return None


timeline_conflict_repository = TimelineConflictRepository()
