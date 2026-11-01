from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class CareTeamRepository(BaseRepository):
    collection_name = "care_team_memberships"

    async def get_patient_memberships(self, patient_id: str) -> List[Dict[str, Any]]:
        return await self.find_many({"patient_id": patient_id, "active": True})

    async def get_care_team_patient_ids(self, care_team_id: str) -> List[str]:
        memberships = await self.find_many({"care_team_id": care_team_id, "active": True})
        return list({m["patient_id"] for m in memberships if "patient_id" in m})

    async def get_clinician_patient_ids(self, clinician_id: str, care_team_id: Optional[str] = None) -> List[str]:
        query: Dict[str, Any] = {"active": True}
        if care_team_id:
            query["$or"] = [
                {"clinician_id": clinician_id},
                {"care_team_id": care_team_id},
            ]
        else:
            query["clinician_id"] = clinician_id

        memberships = await self.find_many(query)
        return list({m["patient_id"] for m in memberships if "patient_id" in m})

    async def is_clinician_assigned_to_patient(
        self,
        patient_id: str,
        clinician_id: Optional[str] = None,
        care_team_id: Optional[str] = None,
    ) -> bool:
        """
        Verifies if clinician or care_team has an active membership for patient_id.
        """
        conditions: List[Dict[str, Any]] = []
        if clinician_id:
            conditions.append({"clinician_id": clinician_id})
        if care_team_id:
            conditions.append({"care_team_id": care_team_id})

        if not conditions:
            return False

        query: Dict[str, Any] = {
            "patient_id": patient_id,
            "active": True,
            "$or": conditions,
        }
        count = await self.count(query)
        return count > 0


care_team_repository = CareTeamRepository()
