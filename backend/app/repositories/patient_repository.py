from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class PatientRepository(BaseRepository):
    collection_name = "patients"

    async def get_by_patient_id(self, patient_id: str) -> Optional[Dict[str, Any]]:
        """Lookups are strictly by internal patient ID or MRN, never by name/DOB identity matching."""
        return await self.find_one({"patient_id": patient_id})

    async def get_by_mrn(self, mrn: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"mrn": mrn.upper().strip()})

    async def search_scoped(
        self,
        allowed_patient_ids: Optional[List[str]] = None,
        hospital_id: Optional[str] = None,
        search_term: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Executes a scoped query. If the caller has an restricted set of allowed_patient_ids,
        only those IDs will ever be matched. Returns a uniform list of results.
        """
        if allowed_patient_ids is not None and len(allowed_patient_ids) == 0:
            return []

        query: Dict[str, Any] = {}

        if allowed_patient_ids is not None:
            query["patient_id"] = {"$in": allowed_patient_ids}

        if hospital_id:
            query["hospital_ids"] = hospital_id

        if search_term:
            term = search_term.strip()
            # Can match MRN or internal patient_id; name search is allowed only within already-authorized scope
            query["$or"] = [
                {"patient_id": {"$regex": term, "$options": "i"}},
                {"mrn": {"$regex": term, "$options": "i"}},
                {"name": {"$regex": term, "$options": "i"}},
            ]

        return await self.find_many(query=query, skip=skip, limit=limit, sort=[("name", 1)])


patient_repository = PatientRepository()
