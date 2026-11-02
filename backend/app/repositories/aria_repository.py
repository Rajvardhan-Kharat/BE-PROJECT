import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.core.database import get_database

logger = logging.getLogger("vericare.repositories.aria")


class AriaRepository:
    """
    Dedicated MongoDB repository for Aria mental-health companion data.

    INVARIANT:
    Operates strictly on dedicated collections:
      - aria_sessions
      - aria_messages
      - aria_sharing_authorizations
      - aria_shared_summaries
      - aria_notice_acknowledgments
    Data from these collections NEVER merges into EHR clinical records, patient timelines,
    medical search, Second Memory, or emergency summary views.
    """

    async def _db(self):
        return await get_database()

    # --- SESSIONS ---

    async def create_session(
        self, patient_id: str, session_id: str, title: str
    ) -> Dict[str, Any]:
        db = await self._db()
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "session_id": session_id,
            "session_ref": session_id,
            "patient_id": patient_id,
            "title": title,
            "status": "active",
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
        }
        await db.aria_sessions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        db = await self._db()
        doc = await db.aria_sessions.find_one({
            "$or": [{"session_id": session_id}, {"session_ref": session_id}]
        })
        if doc:
            doc.pop("_id", None)
        return doc

    async def list_sessions_for_patient(self, patient_id: str) -> List[Dict[str, Any]]:
        db = await self._db()
        cursor = db.aria_sessions.find({"patient_id": patient_id}).sort("created_at", -1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            if "session_ref" not in doc and "session_id" in doc:
                doc["session_ref"] = doc["session_id"]
            results.append(doc)
        return results

    async def delete_session(self, session_id: str, patient_id: str) -> bool:
        db = await self._db()
        res = await db.aria_sessions.delete_one({
            "$or": [{"session_id": session_id}, {"session_ref": session_id}],
            "patient_id": patient_id,
        })
        if res.deleted_count > 0:
            await db.aria_messages.delete_many({
                "$or": [{"session_id": session_id}, {"session_ref": session_id}],
                "patient_id": patient_id,
            })
            return True
        return False

    # --- MESSAGES ---

    async def save_message(
        self,
        session_id: str,
        patient_id: str,
        message_id: str,
        sender: str,
        text: str,
        provider_name: str,
        safety_event: bool = False,
        crisis_guidance: Optional[str] = None,
        crisis_resources: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        db = await self._db()
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "message_id": message_id,
            "session_id": session_id,
            "session_ref": session_id,
            "patient_id": patient_id,
            "sender": sender,
            "text": text,
            "provider_name": provider_name,
            "safety_event": safety_event,
            "crisis_guidance": crisis_guidance,
            "crisis_resources": crisis_resources,
            "created_at": now,
        }
        await db.aria_messages.insert_one(doc)

        # Update session timestamp and message count
        await db.aria_sessions.update_one(
            {"$or": [{"session_id": session_id}, {"session_ref": session_id}], "patient_id": patient_id},
            {"$set": {"updated_at": now}, "$inc": {"message_count": 1}},
        )

        doc.pop("_id", None)
        return doc

    async def list_messages_for_session(
        self, session_id: str, patient_id: str
    ) -> List[Dict[str, Any]]:
        db = await self._db()
        cursor = db.aria_messages.find({
            "$or": [{"session_id": session_id}, {"session_ref": session_id}],
            "patient_id": patient_id,
        }).sort("created_at", 1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            if "session_ref" not in doc and "session_id" in doc:
                doc["session_ref"] = doc["session_id"]
            results.append(doc)
        return results

    # --- NOTICE ACKNOWLEDGMENTS ---

    async def get_notice_acknowledgment(self, patient_id: str) -> Optional[Dict[str, Any]]:
        db = await self._db()
        doc = await db.aria_notice_acknowledgments.find_one({"patient_id": patient_id})
        if doc:
            doc.pop("_id", None)
        return doc

    async def record_notice_acknowledgment(
        self, patient_id: str, provider_label: str, mode: str
    ) -> Dict[str, Any]:
        db = await self._db()
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "patient_id": patient_id,
            "provider_label": provider_label,
            "mode": mode,
            "acknowledged_at": now,
        }
        await db.aria_notice_acknowledgments.update_one(
            {"patient_id": patient_id},
            {"$set": doc},
            upsert=True,
        )
        return doc

    # --- SHARING AUTHORIZATIONS & IMMUTABLE SNAPSHOTS ---

    async def create_shared_summary(
        self,
        share_id: str,
        patient_id: str,
        recipient_id: str,
        recipient_name: str,
        summary_text: str,
        consent_version: str,
        purpose: str,
    ) -> Dict[str, Any]:
        db = await self._db()
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "share_id": share_id,
            "summary_id": share_id,
            "auth_id": share_id,
            "patient_id": patient_id,
            "recipient_id": recipient_id,
            "recipient_name": recipient_name,
            "summary_text": summary_text,
            "status": "active",
            "consent_version": consent_version,
            "purpose": purpose,
            "shared_at": now,
            "revoked_at": None,
            "revocation_reason": None,
        }
        # 1. Save immutable snapshot in aria_shared_summaries
        await db.aria_shared_summaries.insert_one(dict(doc))
        # 2. Record sharing authorization in aria_sharing_authorizations
        await db.aria_sharing_authorizations.insert_one(dict(doc))

        doc.pop("_id", None)
        return doc

    async def get_shared_summary(self, share_id: str) -> Optional[Dict[str, Any]]:
        db = await self._db()
        doc = await db.aria_shared_summaries.find_one({
            "$or": [{"share_id": share_id}, {"summary_id": share_id}]
        })
        if doc:
            doc.pop("_id", None)
        return doc

    async def list_shares_for_patient(self, patient_id: str) -> List[Dict[str, Any]]:
        db = await self._db()
        cursor = db.aria_shared_summaries.find({"patient_id": patient_id}).sort("shared_at", -1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    async def get_active_share_for_recipient(
        self, patient_id: str, recipient_id: str
    ) -> Optional[Dict[str, Any]]:
        db = await self._db()
        doc = await db.aria_shared_summaries.find_one({
            "patient_id": patient_id,
            "recipient_id": recipient_id,
            "status": "active",
        })
        if doc:
            doc.pop("_id", None)
        return doc

    async def revoke_shared_summary(
        self, share_id: str, patient_id: str, reason: str
    ) -> Optional[Dict[str, Any]]:
        db = await self._db()
        now = datetime.now(timezone.utc).isoformat()
        update_fields = {
            "status": "revoked",
            "revoked_at": now,
            "revocation_reason": reason,
        }
        res = await db.aria_shared_summaries.update_one(
            {"$or": [{"share_id": share_id}, {"summary_id": share_id}], "patient_id": patient_id},
            {"$set": update_fields},
        )
        if res.matched_count == 0:
            return None

        await db.aria_sharing_authorizations.update_one(
            {"$or": [{"share_id": share_id}, {"auth_id": share_id}], "patient_id": patient_id},
            {"$set": update_fields},
        )

        return await self.get_shared_summary(share_id)


aria_repository = AriaRepository()
