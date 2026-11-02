from typing import Any, Dict, List, Optional
from backend.app.core.database import get_database
from backend.app.repositories.base import BaseRepository


class FollowUpRepository(BaseRepository):
    collection_name = "follow_ups"

    async def get_by_id(self, follow_up_id: str) -> Optional[Dict[str, Any]]:
        db = await get_database()
        return await db[self.collection_name].find_one({"follow_up_id": follow_up_id})

    async def list_by_patient(
        self,
        patient_id: str,
        status: Optional[str] = None,
        follow_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        db = await get_database()
        query: Dict[str, Any] = {"patient_id": patient_id}
        if status:
            query["status"] = status
        if follow_type:
            query["type"] = follow_type
        cursor = db[self.collection_name].find(query).sort("due_date", 1)
        return await cursor.to_list(length=200)

    async def create_followup(self, doc: Dict[str, Any]) -> str:
        db = await get_database()
        await db[self.collection_name].insert_one(doc)
        return doc["follow_up_id"]

    async def update_status(
        self,
        follow_up_id: str,
        status: str,
        audit_entry: Dict[str, Any],
        new_due_date: Optional[str] = None,
        completed_date: Optional[str] = None,
    ) -> bool:
        db = await get_database()
        update_doc: Dict[str, Any] = {
            "$set": {
                "status": status,
                "updated_at": audit_entry["changed_at"],
            },
            "$push": {
                "audit_history": audit_entry,
            },
        }
        if new_due_date:
            update_doc["$set"]["due_date"] = new_due_date
        if completed_date:
            update_doc["$set"]["completed_date"] = completed_date

        res = await db[self.collection_name].update_one(
            {"follow_up_id": follow_up_id},
            update_doc,
        )
        return res.modified_count > 0


followup_repository = FollowUpRepository()
