import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.core.database import get_database


class CollaborationRepository:
    """
    Data access layer for Second Memory (clinical_notes), Care-Team Tasks (clinical_tasks),
    Specialist Queries (specialist_queries), and Clinical Notifications (clinical_notifications).
    """

    # -------------------------------------------------------------------------
    # Second Memory: Clinical Notes
    # -------------------------------------------------------------------------
    async def create_note(self, note_doc: Dict[str, Any]) -> str:
        db = await get_database()
        await db.clinical_notes.insert_one(note_doc)
        return note_doc["note_id"]

    async def get_note_by_id(self, note_id: str) -> Optional[Dict[str, Any]]:
        db = await get_database()
        return await db.clinical_notes.find_one({"note_id": note_id})

    async def search_notes(
        self,
        patient_id: str,
        current_user_id: str,
        query: Optional[str] = None,
        tag: Optional[str] = None,
        author_id: Optional[str] = None,
        specialty: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        db = await get_database()

        # Strict Security Boundary:
        # Notes visible if:
        # 1. Note is public to the care team (is_private == False)
        # 2. OR Note is private AND author_id == current_user_id
        clauses: List[Dict[str, Any]] = [
            {"patient_id": patient_id},
            {
                "$or": [
                    {"is_private": False},
                    {"$and": [{"is_private": True}, {"author_id": current_user_id}]},
                ]
            },
        ]

        if tag:
            clauses.append({"tags": tag})
        if author_id:
            clauses.append({"author_id": author_id})
        if specialty:
            clauses.append({"specialty": {"$regex": f"^{re.escape(specialty)}$", "$options": "i"}})
        if date_from:
            clauses.append({"created_at": {"$gte": date_from}})
        if date_to:
            clauses.append({"created_at": {"$lte": date_to}})
        if query:
            escaped_q = re.escape(query.strip())
            clauses.append({
                "$or": [
                    {"title": {"$regex": escaped_q, "$options": "i"}},
                    {"content": {"$regex": escaped_q, "$options": "i"}},
                    {"tags": {"$regex": escaped_q, "$options": "i"}},
                ]
            })

        filter_doc = {"$and": clauses}
        cursor = db.clinical_notes.find(filter_doc).sort("created_at", -1)
        return await cursor.to_list(length=200)

    # -------------------------------------------------------------------------
    # Care-Team Workspace: Tasks
    # -------------------------------------------------------------------------
    async def create_task(self, task_doc: Dict[str, Any]) -> str:
        db = await get_database()
        await db.clinical_tasks.insert_one(task_doc)
        return task_doc["task_id"]

    async def get_task_by_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        db = await get_database()
        return await db.clinical_tasks.find_one({"task_id": task_id})

    async def list_tasks(
        self,
        patient_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        db = await get_database()
        filter_doc: Dict[str, Any] = {}
        if patient_id:
            filter_doc["patient_id"] = patient_id
        if assigned_to:
            filter_doc["assigned_to"] = assigned_to
        if status:
            filter_doc["status"] = status
        cursor = db.clinical_tasks.find(filter_doc).sort("due_date", 1)
        return await cursor.to_list(length=100)

    async def update_task(
        self,
        task_id: str,
        status: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> bool:
        db = await get_database()
        now_str = datetime.now(timezone.utc).isoformat()
        set_fields: Dict[str, Any] = {"updated_at": now_str}
        if status:
            set_fields["status"] = status
            if status == "completed":
                set_fields["completed_at"] = now_str
        if notes is not None:
            set_fields["notes"] = notes

        res = await db.clinical_tasks.update_one({"task_id": task_id}, {"$set": set_fields})
        return res.modified_count > 0

    # -------------------------------------------------------------------------
    # Questions Between Specialists
    # -------------------------------------------------------------------------
    async def create_query(self, query_doc: Dict[str, Any]) -> str:
        db = await get_database()
        await db.specialist_queries.insert_one(query_doc)
        return query_doc["query_id"]

    async def get_query_by_id(self, query_id: str) -> Optional[Dict[str, Any]]:
        db = await get_database()
        return await db.specialist_queries.find_one({"query_id": query_id})

    async def list_queries(
        self,
        patient_id: str,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        db = await get_database()
        filter_doc: Dict[str, Any] = {"patient_id": patient_id}
        if status:
            filter_doc["status"] = status
        cursor = db.specialist_queries.find(filter_doc).sort("created_at", -1)
        return await cursor.to_list(length=100)

    async def add_query_response(
        self,
        query_id: str,
        response_doc: Dict[str, Any],
        new_status: str = "answered",
    ) -> bool:
        db = await get_database()
        now_str = datetime.now(timezone.utc).isoformat()
        res = await db.specialist_queries.update_one(
            {"query_id": query_id},
            {
                "$push": {"responses": response_doc},
                "$set": {"status": new_status, "updated_at": now_str},
            },
        )
        return res.modified_count > 0

    # -------------------------------------------------------------------------
    # In-App Notifications
    # -------------------------------------------------------------------------
    async def create_notification(self, notif_doc: Dict[str, Any]) -> str:
        db = await get_database()
        await db.clinical_notifications.insert_one(notif_doc)
        return notif_doc["notification_id"]

    async def list_notifications(
        self,
        recipient_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        db = await get_database()
        cursor = db.clinical_notifications.find({"recipient_id": recipient_id}).sort("created_at", -1)
        return await cursor.to_list(length=limit)

    async def mark_notification_read(self, notification_id: str, recipient_id: str) -> bool:
        db = await get_database()
        res = await db.clinical_notifications.update_one(
            {"notification_id": notification_id, "recipient_id": recipient_id},
            {"$set": {"read": True}},
        )
        return res.modified_count > 0

    async def mark_all_notifications_read(self, recipient_id: str) -> int:
        db = await get_database()
        res = await db.clinical_notifications.update_many(
            {"recipient_id": recipient_id, "read": False},
            {"$set": {"read": True}},
        )
        return res.modified_count


collaboration_repository = CollaborationRepository()
