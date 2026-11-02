from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class RecordVersionRepository(BaseRepository):
    """
    Append-only repository for clinical record versions.
    INVARIANTS:
    - History is immutable and append-only.
    - Approving creates a new approved version and marks prior active versions superseded.
    - Old imports never overwrite newer reviewed records.
    """
    collection_name = "record_versions"

    async def get_by_version_id(self, version_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"version_id": version_id})

    async def get_by_record_id(self, record_id: str) -> List[Dict[str, Any]]:
        return await self.find_many(
            query={"record_id": record_id},
            sort=[("version_number", 1)],
        )

    async def get_latest_version(self, record_id: str) -> Optional[Dict[str, Any]]:
        versions = await self.find_many(
            query={"record_id": record_id},
            sort=[("version_number", -1)],
            limit=1,
        )
        return versions[0] if versions else None

    async def get_latest_approved(self, record_id: str) -> Optional[Dict[str, Any]]:
        versions = await self.find_many(
            query={"record_id": record_id, "status": "approved"},
            sort=[("version_number", -1)],
            limit=1,
        )
        return versions[0] if versions else None

    async def get_queue(
        self,
        hospital_id: Optional[str] = None,
        specialties: Optional[List[str]] = None,
        status_list: Optional[List[str]] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Queries records awaiting verifier review (pending_review, requires_correction)."""
        query: Dict[str, Any] = {}
        if status_list:
            query["status"] = {"$in": status_list}
        else:
            query["status"] = {"$in": ["pending_review", "requires_correction"]}

        if hospital_id:
            query["hospital_id"] = hospital_id

        if specialties and "*" not in specialties:
            query["department"] = {"$in": specialties}

        return await self.find_many(
            query=query,
            skip=skip,
            limit=limit,
            sort=[("submitted_at", -1)],
        )

    async def mark_superseded(
        self,
        version_id: str,
        superseded_by: str,
        superseded_at: Optional[datetime] = None,
    ) -> bool:
        """Marks an existing record version as superseded by a newer version."""
        now = superseded_at or datetime.now(timezone.utc)
        return await self.update_one(
            {"version_id": version_id},
            {
                "status": "superseded",
                "superseded_by": superseded_by,
                "superseded_at": now,
            },
        )

    async def get_patient_approved_records(
        self, patient_id: str, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Returns currently active approved records for a patient (only approved, not superseded)."""
        return await self.find_many(
            query={"patient_id": patient_id, "status": "approved"},
            skip=skip,
            limit=limit,
            sort=[("reviewed_at", -1)],
        )

    async def get_patient_pending_records(
        self, patient_id: str, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Returns proposals currently pending review or requiring correction for a patient."""
        return await self.find_many(
            query={
                "patient_id": patient_id,
                "status": {"$in": ["pending_review", "requires_correction"]},
            },
            skip=skip,
            limit=limit,
            sort=[("submitted_at", -1)],
        )

    async def count_patient_records(self, patient_id: str, status_val: str) -> int:
        col = await self.get_collection()
        return await col.count_documents({"patient_id": patient_id, "status": status_val})


record_version_repository = RecordVersionRepository()
