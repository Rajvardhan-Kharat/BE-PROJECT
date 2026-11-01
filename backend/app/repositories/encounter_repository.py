from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class EncounterRepository(BaseRepository):
    collection_name = "encounters"

    async def get_by_encounter_id(self, encounter_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"encounter_id": encounter_id})

    async def get_patient_encounters(
        self, patient_id: str, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        return await self.find_many(
            query={"patient_id": patient_id},
            skip=skip,
            limit=limit,
            sort=[("admission_date", -1)],
        )

    async def count_patient_encounters(self, patient_id: str) -> int:
        return await self.count({"patient_id": patient_id})


encounter_repository = EncounterRepository()
