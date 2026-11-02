from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class ConsentRepository(BaseRepository):
    collection_name = "patient_consents"

    async def create_consent(self, consent_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self.create(consent_data)

    async def get_by_consent_id(self, consent_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"consent_id": consent_id})

    async def list_by_patient_id(
        self, patient_id: str, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"patient_id": patient_id}
        if status:
            query["status"] = status
        return await self.find_many(query, sort=[("created_at", -1)])

    async def revoke_consent(
        self, consent_id: str, reason: str, revoked_at: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        revoked_time = revoked_at or datetime.now(timezone.utc)
        collection = await self.get_collection()
        result = await collection.find_one_and_update(
            {"consent_id": consent_id},
            {
                "$set": {
                    "status": "revoked",
                    "revocation_reason": reason,
                    "revoked_at": revoked_time,
                    "updated_at": revoked_time,
                }
            },
            return_document=True,
        )
        if result and "_id" in result:
            result["id"] = str(result.pop("_id"))
        return result

    async def find_active_consent_for_read(
        self,
        patient_id: str,
        recipient: Optional[str] = None,
        purpose: str = "treatment",
        category: str = "*",
    ) -> Optional[Dict[str, Any]]:
        """
        Searches for an active granted consent record matching the access context:
        - patient_id
        - status == "granted"
        - revoked_at is None
        - effective_from <= now
        - expires_at is None or expires_at > now
        - recipient matches or is wildcard ('*', 'all_care_team')
        - purpose matches or is wildcard ('*')
        - category in categories or '*' in categories
        """
        now = datetime.now(timezone.utc)
        collection = await self.get_collection()

        recipient_conditions = [{"recipient": "*"}]
        if recipient:
            recipient_conditions.extend([{"recipient": recipient}, {"recipient": "all_care_team"}])

        query: Dict[str, Any] = {
            "patient_id": patient_id,
            "status": "granted",
            "revoked_at": None,
            "effective_from": {"$lte": now},
            "$or": [
                {"expires_at": None},
                {"expires_at": {"$gt": now}},
            ],
            "$and": [
                {"$or": recipient_conditions},
                {"$or": [{"purpose": purpose}, {"purpose": "*"}]},
                {"$or": [{"categories": category}, {"categories": "*"}]},
            ],
        }

        doc = await collection.find_one(query)
        if doc and "_id" in doc:
            doc["id"] = str(doc.pop("_id"))
        return doc

    async def has_explicit_revocation(
        self,
        patient_id: str,
        recipient: Optional[str] = None,
        category: str = "*",
    ) -> bool:
        """
        Checks if the patient has explicitly revoked a consent record specifically
        targeting this recipient or category.
        """
        collection = await self.get_collection()
        recipient_conditions = [{"recipient": "*"}]
        if recipient:
            recipient_conditions.extend([{"recipient": recipient}, {"recipient": "all_care_team"}])

        query: Dict[str, Any] = {
            "patient_id": patient_id,
            "status": "revoked",
            "$or": recipient_conditions,
        }
        if category != "*":
            query["$and"] = [{"$or": [{"categories": category}, {"categories": "*"}]}]

        doc = await collection.find_one(query)
        return doc is not None


consent_repository = ConsentRepository()
