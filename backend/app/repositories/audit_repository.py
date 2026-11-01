import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from backend.app.core.database import get_database


class AuditRepository:
    """
    Append-only repository for clinical and security audit events.
    Notice: Does NOT implement or expose update or delete methods to preserve audit integrity.
    """
    collection_name = "audit_events"

    def __init__(self, db: Optional[AsyncIOMotorDatabase] = None):
        self._db = db

    async def get_collection(self) -> AsyncIOMotorCollection:
        if self._db is not None:
            return self._db[self.collection_name]
        db = await get_database()
        return db[self.collection_name]

    async def append_event(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """Inserts an immutable audit event."""
        collection = await self.get_collection()
        doc = dict(event_data)
        if "id" not in doc and "_id" not in doc:
            doc["_id"] = str(uuid.uuid4())
        if "timestamp" not in doc:
            doc["timestamp"] = datetime.now(timezone.utc)

        await collection.insert_one(doc)
        doc["id"] = str(doc.get("_id"))
        return doc

    async def query_events(
        self,
        query: Optional[Dict[str, Any]] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Queries events in reverse chronological order."""
        collection = await self.get_collection()
        cursor = collection.find(query or {}).sort("timestamp", -1).skip(skip).limit(limit)
        events = []
        async for doc in cursor:
            if "_id" in doc:
                doc["id"] = str(doc["_id"])
            events.append(doc)
        return events

    async def count_events(self, query: Optional[Dict[str, Any]] = None) -> int:
        collection = await self.get_collection()
        return await collection.count_documents(query or {})


audit_repository = AuditRepository()
