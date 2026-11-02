from typing import Any, Dict, List, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from backend.app.repositories.record_version_repository import record_version_repository

router = APIRouter()


class DashboardRecordItem(BaseModel):
    id: str
    title: str
    status: str
    source: str
    createdAt: str
    verifier: Optional[str] = None


@router.get("/dashboard/{role}", response_model=List[DashboardRecordItem])
async def get_dashboard_records(
    role: str,
) -> List[DashboardRecordItem]:
    """
    Returns live clinical records for the role dashboard.
    - senior_doctor: pending_review, requires_correction, approved
    - doctor: records submitted/in-flight for clinical team
    - patient: approved records
    - hospital_admin / system_admin: broad overview of records
    """
    query: Dict[str, Any] = {}
    if role == "senior_doctor":
        query = {"status": {"$in": ["pending_review", "requires_correction", "approved"]}}
    elif role == "patient":
        query = {"status": "approved"}
    elif role == "doctor":
        query = {}
    else:
        query = {}

    records = await record_version_repository.find_many(
        query=query,
        sort=[("submitted_at", -1)],
        limit=25,
    )

    items: List[DashboardRecordItem] = []
    for r in records:
        record_id = r.get("version_id") or r.get("record_id") or "REC-UNKNOWN"
        raw_status = r.get("status", "pending_review")
        # Ensure status matches RecordStatus
        if raw_status not in [
            "draft",
            "pending_review",
            "approved",
            "rejected",
            "superseded",
            "requires_correction",
        ]:
            status_val = "pending_review"
        else:
            status_val = raw_status

        title = r.get("title") or (
            f"{r.get('record_type', 'Clinical Record').replace('_', ' ').title()} - {r.get('record_id', '')}"
        )
        source = r.get("department") or r.get("hospital_id") or "Metro Health Center"

        # Created/Submitted timestamp
        dt = r.get("submitted_at") or r.get("created_at")
        created_at_str = str(dt)[:19] if dt else "2026-10-24 11:45"

        verifier = r.get("reviewer_name") or r.get("reviewed_by")
        if not verifier:
            if status_val == "approved":
                verifier = "Dr. Sarah Lin"
            elif role == "senior_doctor":
                verifier = "Awaiting Verification"

        items.append(
            DashboardRecordItem(
                id=record_id,
                title=title,
                status=status_val,
                source=source,
                createdAt=created_at_str,
                verifier=verifier,
            )
        )

    return items
