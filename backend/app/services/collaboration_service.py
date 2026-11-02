import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from backend.app.repositories.collaboration_repository import collaboration_repository
from backend.app.schemas.collaboration import (
    CitedSummaryRecordRef,
    CitedSummaryRequest,
    CitedSummaryResponse,
    ClinicalNoteCreate,
    ClinicalNoteResponse,
    ClinicalTaskCreate,
    ClinicalTaskResponse,
    ClinicalTaskUpdate,
    NoteCitation,
    NotificationResponse,
    NotificationsListResponse,
    SpecialistQueryCreate,
    SpecialistQueryReplyCreate,
    SpecialistQueryResponse,
    SpecialistQueryResponseItem,
)
from backend.app.services.audit_service import audit_service
from backend.app.services.patient_service import patient_service


class CollaborationService:
    # -------------------------------------------------------------------------
    # Second Memory: Clinical Notes
    # -------------------------------------------------------------------------
    async def create_clinical_note(
        self,
        payload: ClinicalNoteCreate,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> ClinicalNoteResponse:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=payload.patient_id,
            resource_path="/api/v1/collaboration/notes",
            client_ip=client_ip,
        )

        now_str = datetime.now(timezone.utc).isoformat()
        note_id = f"NOTE-{uuid.uuid4().hex[:10].upper()}"

        author_name = current_user.get("name") or "Dr. Clinician"
        specialty = current_user.get("specialty") or "General Medicine"

        doc = {
            "note_id": note_id,
            "patient_id": payload.patient_id,
            "author_id": current_user["user_id"],
            "author_name": author_name,
            "author_role": current_user.get("role", "doctor"),
            "specialty": specialty,
            "title": payload.title,
            "content": payload.content,
            "is_private": payload.is_private,
            "tags": payload.tags,
            "citations": [c.model_dump() for c in payload.citations],
            "created_at": now_str,
            "updated_at": now_str,
        }

        await collaboration_repository.create_note(doc)

        await audit_service.log_event(
            event_type="CLINICAL_NOTE_CREATED",
            user_id=current_user["user_id"],
            role=current_user.get("role", "unknown"),
            details={
                "patient_id": payload.patient_id,
                "action": "CREATE",
                "resource": f"/api/v1/collaboration/notes/{note_id}",
                "is_private": payload.is_private,
                "title": payload.title,
                "tags": payload.tags,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        return ClinicalNoteResponse(
            note_id=note_id,
            patient_id=payload.patient_id,
            author_id=current_user["user_id"],
            author_name=author_name,
            author_role=current_user.get("role", "doctor"),
            specialty=specialty,
            title=payload.title,
            content=payload.content,
            is_private=payload.is_private,
            tags=payload.tags,
            citations=payload.citations,
            created_at=now_str,
            updated_at=now_str,
        )

    async def get_clinical_note(
        self,
        note_id: str,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> ClinicalNoteResponse:
        note = await collaboration_repository.get_note_by_id(note_id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinical note not found")

        # Security check: Base patient access
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=note["patient_id"],
            resource_path=f"/api/v1/collaboration/notes/{note_id}",
            client_ip=client_ip,
        )

        # MANDATORY SECURITY BOUNDARY:
        # Private notes are visible ONLY to their author!
        if note.get("is_private") and note.get("author_id") != current_user["user_id"]:
            await audit_service.log_event(
                event_type="COLLABORATION_PRIVATE_NOTE_DENIED",
                user_id=current_user["user_id"],
                role=current_user.get("role", "unknown"),
                details={
                    "patient_id": note["patient_id"],
                    "action": "READ",
                    "resource": f"/api/v1/collaboration/notes/{note_id}",
                    "note_id": note_id,
                    "author_id": note.get("author_id"),
                    "reason": "Non-author doctor attempted to access private clinician scratchpad note.",
                },
                status="DENIED",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: This note is marked private to its author."
            )

        citations = [NoteCitation(**c) for c in note.get("citations", [])]
        return ClinicalNoteResponse(
            note_id=note["note_id"],
            patient_id=note["patient_id"],
            author_id=note["author_id"],
            author_name=note.get("author_name", "Unknown"),
            author_role=note.get("author_role", "doctor"),
            specialty=note.get("specialty", "General"),
            title=note["title"],
            content=note["content"],
            is_private=note.get("is_private", False),
            tags=note.get("tags", []),
            citations=citations,
            created_at=note.get("created_at", ""),
            updated_at=note.get("updated_at", ""),
        )

    async def search_clinical_notes(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        query: Optional[str] = None,
        tag: Optional[str] = None,
        author_id: Optional[str] = None,
        specialty: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> List[ClinicalNoteResponse]:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path="/api/v1/collaboration/notes",
            client_ip=client_ip,
        )

        notes = await collaboration_repository.search_notes(
            patient_id=patient_id,
            current_user_id=current_user["user_id"],
            query=query,
            tag=tag,
            author_id=author_id,
            specialty=specialty,
            date_from=date_from,
            date_to=date_to,
        )

        results: List[ClinicalNoteResponse] = []
        for n in notes:
            citations = [NoteCitation(**c) for c in n.get("citations", [])]
            results.append(
                ClinicalNoteResponse(
                    note_id=n["note_id"],
                    patient_id=n["patient_id"],
                    author_id=n["author_id"],
                    author_name=n.get("author_name", "Unknown"),
                    author_role=n.get("author_role", "doctor"),
                    specialty=n.get("specialty", "General"),
                    title=n["title"],
                    content=n["content"],
                    is_private=n.get("is_private", False),
                    tags=n.get("tags", []),
                    citations=citations,
                    created_at=n.get("created_at", ""),
                    updated_at=n.get("updated_at", ""),
                )
            )
        return results

    async def generate_cited_summary(
        self,
        patient_id: str,
        payload: CitedSummaryRequest,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> CitedSummaryResponse:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path=f"/api/v1/collaboration/notes/patient/{patient_id}/cited-summary",
            client_ip=client_ip,
        )

        notes = await collaboration_repository.search_notes(
            patient_id=patient_id,
            current_user_id=current_user["user_id"],
            query=payload.topic,
            date_from=payload.date_from,
            date_to=payload.date_to,
        )

        cited_refs: List[CitedSummaryRecordRef] = []
        bullet_points: List[str] = []

        for note in notes:
            snippet = note["content"][:160].strip() + ("..." if len(note["content"]) > 160 else "")
            cited_refs.append(
                CitedSummaryRecordRef(
                    note_id=note["note_id"],
                    author_name=note.get("author_name", "Clinician"),
                    specialty=note.get("specialty", "Clinical"),
                    date=note.get("created_at", "")[:10],
                    snippet=snippet,
                )
            )
            bullet_points.append(
                f"• [{note.get('created_at', '')[:10]} - {note.get('specialty')}] {note['title']}: {snippet}"
            )

        if not bullet_points:
            summary_text = f"No clinical notes found for patient {patient_id} in the specified date range / topic filter."
        else:
            summary_text = (
                f"Second Memory Clinical Synthesis ({len(notes)} notes analyzed across care team):\n\n"
                + "\n".join(bullet_points)
            )

        return CitedSummaryResponse(
            patient_id=patient_id,
            date_range={"from": payload.date_from, "to": payload.date_to},
            topic_filter=payload.topic,
            summary_text=summary_text,
            cited_records=cited_refs,
            total_notes_analyzed=len(notes),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    # -------------------------------------------------------------------------
    # Care-Team Workspace: Tasks
    # -------------------------------------------------------------------------
    async def create_task(
        self,
        payload: ClinicalTaskCreate,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> ClinicalTaskResponse:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=payload.patient_id,
            resource_path="/api/v1/collaboration/tasks",
            client_ip=client_ip,
        )

        now_str = datetime.now(timezone.utc).isoformat()
        task_id = f"TSK-{uuid.uuid4().hex[:10].upper()}"

        assigned_by_name = current_user.get("name") or "Dr. Clinician"

        doc = {
            "task_id": task_id,
            "patient_id": payload.patient_id,
            "title": payload.title,
            "description": payload.description,
            "assigned_to": payload.assigned_to,
            "assigned_to_name": payload.assigned_to,  # will resolve in UI/service
            "assigned_by": current_user["user_id"],
            "assigned_by_name": assigned_by_name,
            "priority": payload.priority,
            "due_date": payload.due_date,
            "status": "pending",
            "completed_at": None,
            "created_at": now_str,
            "updated_at": now_str,
        }

        await collaboration_repository.create_task(doc)

        # Notify assignee
        notif_doc = {
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
            "recipient_id": payload.assigned_to,
            "patient_id": payload.patient_id,
            "type": "task_assigned",
            "title": f"New Clinical Task: {payload.title}",
            "message": f"{assigned_by_name} assigned you a {payload.priority}-priority task due on {payload.due_date}.",
            "link": f"/patients/{payload.patient_id}/workspace",
            "read": False,
            "created_at": now_str,
        }
        await collaboration_repository.create_notification(notif_doc)

        await audit_service.log_event(
            event_type="CLINICAL_TASK_CREATED",
            user_id=current_user["user_id"],
            role=current_user.get("role", "unknown"),
            details={
                "patient_id": payload.patient_id,
                "action": "CREATE",
                "resource": f"/api/v1/collaboration/tasks/{task_id}",
                "task_id": task_id,
                "assigned_to": payload.assigned_to,
                "priority": payload.priority,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        return ClinicalTaskResponse(**doc)

    async def list_tasks(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        status_filter: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> List[ClinicalTaskResponse]:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path="/api/v1/collaboration/tasks",
            client_ip=client_ip,
        )

        tasks = await collaboration_repository.list_tasks(patient_id=patient_id, status=status_filter)
        return [ClinicalTaskResponse(**t) for t in tasks]

    async def update_task(
        self,
        task_id: str,
        payload: ClinicalTaskUpdate,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> ClinicalTaskResponse:
        task = await collaboration_repository.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

        await patient_service.check_patient_access(
            user=current_user,
            patient_id=task["patient_id"],
            resource_path=f"/api/v1/collaboration/tasks/{task_id}",
            client_ip=client_ip,
        )

        await collaboration_repository.update_task(
            task_id=task_id,
            status=payload.status,
            notes=payload.notes,
        )

        updated = await collaboration_repository.get_task_by_id(task_id)
        return ClinicalTaskResponse(**updated)

    # -------------------------------------------------------------------------
    # Questions Between Specialists
    # -------------------------------------------------------------------------
    async def create_specialist_query(
        self,
        payload: SpecialistQueryCreate,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> SpecialistQueryResponse:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=payload.patient_id,
            resource_path="/api/v1/collaboration/queries",
            client_ip=client_ip,
        )

        now_str = datetime.now(timezone.utc).isoformat()
        query_id = f"QRY-{uuid.uuid4().hex[:10].upper()}"

        from_doctor_name = current_user.get("name") or "Dr. Clinician"
        from_specialty = current_user.get("specialty") or "General Medicine"

        doc = {
            "query_id": query_id,
            "patient_id": payload.patient_id,
            "from_doctor_id": current_user["user_id"],
            "from_doctor_name": from_doctor_name,
            "from_specialty": from_specialty,
            "to_doctor_id": payload.to_doctor_id,
            "to_doctor_name": payload.to_doctor_id or payload.to_specialty,
            "to_specialty": payload.to_specialty,
            "subject": payload.subject,
            "question": payload.question,
            "priority": payload.priority,
            "status": "open",
            "responses": [],
            "created_at": now_str,
            "updated_at": now_str,
        }

        await collaboration_repository.create_query(doc)

        # Notify recipient doctor if specified
        if payload.to_doctor_id:
            notif = {
                "notification_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
                "recipient_id": payload.to_doctor_id,
                "patient_id": payload.patient_id,
                "type": "specialist_query",
                "title": f"Specialist Query: {payload.subject}",
                "message": f"{from_doctor_name} ({from_specialty}) requested your clinical insight.",
                "link": f"/patients/{payload.patient_id}/workspace",
                "read": False,
                "created_at": now_str,
            }
            await collaboration_repository.create_notification(notif)

        await audit_service.log_event(
            event_type="SPECIALIST_QUERY_CREATED",
            user_id=current_user["user_id"],
            role=current_user.get("role", "unknown"),
            details={
                "patient_id": payload.patient_id,
                "action": "CREATE",
                "resource": f"/api/v1/collaboration/queries/{query_id}",
                "to_specialty": payload.to_specialty,
                "subject": payload.subject,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        return SpecialistQueryResponse(**doc)

    async def list_specialist_queries(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        status_filter: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> List[SpecialistQueryResponse]:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path="/api/v1/collaboration/queries",
            client_ip=client_ip,
        )

        queries = await collaboration_repository.list_queries(patient_id=patient_id, status=status_filter)
        return [SpecialistQueryResponse(**q) for q in queries]

    async def reply_specialist_query(
        self,
        query_id: str,
        payload: SpecialistQueryReplyCreate,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> SpecialistQueryResponse:
        query = await collaboration_repository.get_query_by_id(query_id)
        if not query:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specialist query not found")

        await patient_service.check_patient_access(
            user=current_user,
            patient_id=query["patient_id"],
            resource_path=f"/api/v1/collaboration/queries/{query_id}/reply",
            client_ip=client_ip,
        )

        now_str = datetime.now(timezone.utc).isoformat()
        response_item = {
            "response_id": f"RESP-{uuid.uuid4().hex[:8].upper()}",
            "doctor_id": current_user["user_id"],
            "doctor_name": current_user.get("name") or "Specialist Clinician",
            "specialty": current_user.get("specialty") or "Specialist",
            "answer": payload.answer,
            "created_at": now_str,
        }

        await collaboration_repository.add_query_response(
            query_id=query_id,
            response_doc=response_item,
            new_status="answered",
        )

        # Notify original asking clinician
        notif = {
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
            "recipient_id": query["from_doctor_id"],
            "patient_id": query["patient_id"],
            "type": "query_answered",
            "title": f"Specialist Query Answered: {query['subject']}",
            "message": f"{response_item['doctor_name']} provided an answer to your inquiry.",
            "link": f"/patients/{query['patient_id']}/workspace",
            "read": False,
            "created_at": now_str,
        }
        await collaboration_repository.create_notification(notif)

        updated = await collaboration_repository.get_query_by_id(query_id)
        return SpecialistQueryResponse(**updated)

    # -------------------------------------------------------------------------
    # In-App Notifications
    # -------------------------------------------------------------------------
    async def get_user_notifications(self, current_user: Dict[str, Any]) -> NotificationsListResponse:
        user_id = current_user["user_id"]
        notifs = await collaboration_repository.list_notifications(recipient_id=user_id)
        unread_count = sum(1 for n in notifs if not n.get("read", False))

        responses = [
            NotificationResponse(
                notification_id=n["notification_id"],
                recipient_id=n["recipient_id"],
                patient_id=n.get("patient_id"),
                type=n["type"],
                title=n["title"],
                message=n["message"],
                link=n.get("link"),
                read=n.get("read", False),
                created_at=n["created_at"],
            )
            for n in notifs
        ]
        return NotificationsListResponse(notifications=responses, unread_count=unread_count)

    async def mark_notification_as_read(
        self, notification_id: str, current_user: Dict[str, Any]
    ) -> bool:
        return await collaboration_repository.mark_notification_read(
            notification_id=notification_id,
            recipient_id=current_user["user_id"],
        )

    async def mark_all_notifications_as_read(self, current_user: Dict[str, Any]) -> int:
        return await collaboration_repository.mark_all_notifications_read(
            recipient_id=current_user["user_id"]
        )


collaboration_service = CollaborationService()
