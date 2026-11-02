from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class BreakGlassRepository(BaseRepository):
    collection_name = "break_glass_sessions"

    async def create_session(self, session_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self.create(session_data)

    async def get_by_session_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"session_id": session_id})

    async def find_active_session(
        self, patient_id: str, clinician_id: str
    ) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        collection = await self.get_collection()
        doc = await collection.find_one({
            "patient_id": patient_id,
            "clinician_id": clinician_id,
            "status": "active",
            "expires_at": {"$gt": now},
        })
        if doc and "_id" in doc:
            doc["id"] = str(doc.pop("_id"))
        return doc

    async def list_sessions(
        self,
        patient_id: Optional[str] = None,
        clinician_id: Optional[str] = None,
        review_status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if patient_id:
            query["patient_id"] = patient_id
        if clinician_id:
            query["clinician_id"] = clinician_id
        if review_status:
            query["review_status"] = review_status

        return await self.find_many(query, skip=skip, limit=limit, sort=[("granted_at", -1)])

    async def update_review(
        self,
        session_id: str,
        review_status: str,
        review_notes: str,
        reviewed_by: str,
        reviewed_at: Optional[datetime] = None,
    ) -> Optional[Dict[str, Any]]:
        now = reviewed_at or datetime.now(timezone.utc)
        collection = await self.get_collection()
        result = await collection.find_one_and_update(
            {"session_id": session_id},
            {
                "$set": {
                    "review_status": review_status,
                    "review_notes": review_notes,
                    "reviewed_by": reviewed_by,
                    "reviewed_at": now,
                    "updated_at": now,
                }
            },
            return_document=True,
        )
        if result and "_id" in result:
            result["id"] = str(result.pop("_id"))
        return result

    async def count_recent_requests_for_clinician(
        self, clinician_id: str, since_time: datetime
    ) -> int:
        collection = await self.get_collection()
        return await collection.count_documents({
            "clinician_id": clinician_id,
            "granted_at": {"$gte": since_time},
        })

    async def mark_expired_if_needed(self, session_id: str) -> None:
        now = datetime.now(timezone.utc)
        collection = await self.get_collection()
        await collection.update_one(
            {"session_id": session_id, "expires_at": {"$lte": now}, "status": "active"},
            {"$set": {"status": "expired", "updated_at": now}},
        )


break_glass_repository = BreakGlassRepository()
