from datetime import datetime, timezone
from typing import Optional
from backend.app.repositories.base import BaseRepository


class TokenDenylistRepository(BaseRepository):
    collection_name = "token_denylist"

    async def is_denylisted(self, jti: str) -> bool:
        doc = await self.find_one({"jti": jti})
        return doc is not None

    async def denylist_token(
        self,
        jti: str,
        expires_at: datetime,
        user_id: Optional[str] = None,
        reason: str = "logout",
    ) -> dict:
        doc = {
            "jti": jti,
            "user_id": user_id,
            "reason": reason,
            "denylisted_at": datetime.now(timezone.utc),
            "expires_at": expires_at,
        }
        return await self.create(doc)


token_denylist_repository = TokenDenylistRepository()
