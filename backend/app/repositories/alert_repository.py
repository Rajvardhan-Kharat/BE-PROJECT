from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class AlertRepository(BaseRepository):
    """
    Repository for clinical safety alerts and data inconsistency findings.
    Strictly deterministic alerts with provenance refs, rule_id, rule_version, and source.
    NO invented severity scores.
    """
    collection_name = "clinical_alerts"

    async def get_by_alert_id(self, alert_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"alert_id": alert_id})

    async def get_by_patient(
        self,
        patient_id: str,
        status: Optional[str] = None,
        alert_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"patient_id": patient_id}
        if status and status != "all":
            query["status"] = status
        if alert_type and alert_type != "all":
            query["type"] = alert_type

        return await self.find_many(
            query=query,
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)],
        )

    async def find_existing_alert(
        self,
        patient_id: str,
        rule_id: str,
        evidence_signature: str,
    ) -> Optional[Dict[str, Any]]:
        """Finds active or open alert for deduplication."""
        return await self.find_one({
            "patient_id": patient_id,
            "rule_id": rule_id,
            "evidence_signature": evidence_signature,
        })

    async def dismiss_alert(
        self,
        alert_id: str,
        user_id: str,
        reason: str,
    ) -> bool:
        now = datetime.now(timezone.utc)
        return await self.update_one(
            {"alert_id": alert_id},
            {
                "status": "dismissed",
                "dismissed_by": user_id,
                "dismissed_reason": reason,
                "dismissed_at": now,
                "updated_at": now,
            },
        )

    async def resolve_alert(
        self,
        alert_id: str,
        user_id: str,
        reason: str,
    ) -> bool:
        now = datetime.now(timezone.utc)
        return await self.update_one(
            {"alert_id": alert_id},
            {
                "status": "resolved",
                "resolved_by": user_id,
                "resolved_reason": reason,
                "resolved_at": now,
                "updated_at": now,
            },
        )


alert_repository = AlertRepository()
