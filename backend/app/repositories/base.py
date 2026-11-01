from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from backend.app.core.database import get_database


class BaseRepository:
    collection_name: str

    def __init__(self, db: Optional[AsyncIOMotorDatabase] = None):
        self._db = db

    async def get_collection(self) -> AsyncIOMotorCollection:
        if self._db is not None:
            return self._db[self.collection_name]
        db = await get_database()
        return db[self.collection_name]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        collection = await self.get_collection()
        doc = await collection.find_one(query)
        if doc and "_id" in doc:
            doc["id"] = str(doc["_id"])
        return doc

    async def find_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"_id": doc_id})

    async def find_many(
        self,
        query: Optional[Dict[str, Any]] = None,
        skip: int = 0,
        limit: int = 100,
        sort: Optional[List[tuple]] = None,
    ) -> List[Dict[str, Any]]:
        collection = await self.get_collection()
        cursor = collection.find(query or {})
        if sort:
            cursor = cursor.sort(sort)
        cursor = cursor.skip(skip).limit(limit)
        results = []
        async for doc in cursor:
            if "_id" in doc:
                doc["id"] = str(doc["_id"])
            results.append(doc)
        return results

    async def create(self, document: Dict[str, Any]) -> Dict[str, Any]:
        collection = await self.get_collection()
        doc_to_insert = dict(document)
        result = await collection.insert_one(doc_to_insert)
        doc_to_insert["_id"] = result.inserted_id
        doc_to_insert["id"] = str(result.inserted_id)
        return doc_to_insert

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> bool:
        collection = await self.get_collection()
        result = await collection.update_one(query, {"$set": update})
        return result.modified_count > 0

    async def delete_one(self, query: Dict[str, Any]) -> bool:
        collection = await self.get_collection()
        result = await collection.delete_one(query)
        return result.deleted_count > 0

    async def count(self, query: Optional[Dict[str, Any]] = None) -> int:
        collection = await self.get_collection()
        return await collection.count_documents(query or {})
