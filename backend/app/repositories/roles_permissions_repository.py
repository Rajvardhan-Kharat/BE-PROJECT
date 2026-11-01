from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class RolesPermissionsRepository(BaseRepository):
    collection_name = "roles_permissions"

    async def get_by_role(self, role: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"role": role})

    async def get_permissions_for_role(self, role: str) -> List[str]:
        doc = await self.get_by_role(role)
        if doc and "permissions" in doc:
            return doc["permissions"]
        return []

    async def upsert_role_permissions(
        self, role: str, permissions: List[str], description: str = ""
    ) -> Dict[str, Any]:
        collection = await self.get_collection()
        doc = {
            "role": role,
            "permissions": permissions,
            "description": description,
        }
        await collection.update_one({"role": role}, {"$set": doc}, upsert=True)
        return doc


roles_permissions_repository = RolesPermissionsRepository()
