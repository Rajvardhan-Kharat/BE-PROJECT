from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class PatientNotificationRepository(BaseRepository):
    collection_name = "patient_notifications"

    async def create_notification(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return await self.create(data)

    async def list_for_patient(
        self, patient_id: str, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        return await self.find_many(
            {"patient_id": patient_id},
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)],
        )

    async def mark_as_read(self, notification_id: str, patient_id: str) -> Optional[Dict[str, Any]]:
        collection = await self.get_collection()
        result = await collection.find_one_and_update(
            {"notification_id": notification_id, "patient_id": patient_id},
            {"$set": {"read": True}},
            return_document=True,
        )
        if result and "_id" in result:
            result["id"] = str(result.pop("_id"))
        return result


patient_notification_repository = PatientNotificationRepository()
