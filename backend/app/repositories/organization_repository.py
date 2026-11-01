from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class OrganizationRepository(BaseRepository):
    collection_name = "organizations"

    async def get_by_hospital_id(self, hospital_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"hospital_id": hospital_id})

    async def get_by_hospital_ids(self, hospital_ids: List[str]) -> List[Dict[str, Any]]:
        return await self.find_many({"hospital_id": {"$in": hospital_ids}})


organization_repository = OrganizationRepository()
