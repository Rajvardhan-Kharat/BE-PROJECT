from typing import Any, Dict, Optional
from backend.app.repositories.base import BaseRepository


class UserRepository(BaseRepository):
    collection_name = "users"

    async def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"email": email.lower().strip()})

    async def get_by_user_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"user_id": user_id})


user_repository = UserRepository()
