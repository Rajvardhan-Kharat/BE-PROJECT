from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class PrescriptionRepository(BaseRepository):
    collection_name = "prescriptions"

    async def get_by_prescription_id(self, prescription_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"prescription_id": prescription_id})

    async def get_by_patient(
        self,
        patient_id: str,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"patient_id": patient_id}
        if status:
            query["status"] = status
        return await self.find_many(
            query=query,
            skip=skip,
            limit=limit,
            sort=[("start_date", -1)],
        )

    async def get_active_by_patient(self, patient_id: str) -> List[Dict[str, Any]]:
        return await self.find_many(
            query={"patient_id": patient_id, "status": "active"},
            sort=[("start_date", -1)],
        )

    async def list_prescriptions(
        self, patient_id: str, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return await self.get_by_patient(patient_id=patient_id, status=status)

    async def update_status(
        self,
        prescription_id: str,
        status: str,
        notes: Optional[str] = None,
    ) -> bool:
        update_data: Dict[str, Any] = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if notes:
            update_data["notes"] = notes
        return await self.update_one({"prescription_id": prescription_id}, update_data)


prescription_repository = PrescriptionRepository()
