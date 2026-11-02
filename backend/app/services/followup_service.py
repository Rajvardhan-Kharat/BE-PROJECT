import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from backend.app.agents.followup_agent import followup_tracking_agent
from backend.app.repositories.followup_repository import followup_repository
from backend.app.schemas.followup import (
    FollowUpCreateRequest,
    FollowUpEvaluationResult,
    FollowUpResponse,
    FollowUpStatusUpdateRequest,
    MedicationCourseDetails,
)
from backend.app.services.audit_service import audit_service
from backend.app.services.patient_service import patient_service


class FollowUpService:
    @staticmethod
    def _calculate_days_delta(due_date_str: str) -> int:
        """Returns positive for days remaining, negative for days overdue."""
        try:
            target = datetime.strptime(due_date_str[:10], "%Y-%m-%d").date()
            today = datetime.now(timezone.utc).date()
            return (target - today).days
        except Exception:
            return 0

    async def list_patient_followups(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        status_filter: Optional[str] = None,
        type_filter: Optional[str] = None,
        resource_path: str = "/api/v1/followups",
        client_ip: Optional[str] = None,
    ) -> List[FollowUpResponse]:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path=resource_path,
            client_ip=client_ip,
        )

        items = await followup_repository.list_by_patient(
            patient_id=patient_id,
            status=status_filter,
            follow_type=type_filter,
        )

        responses: List[FollowUpResponse] = []
        for item in items:
            days_delta = self._calculate_days_delta(item.get("due_date", ""))
            med_details = None
            if item.get("medication_details"):
                med_details = MedicationCourseDetails(**item["medication_details"])

            responses.append(
                FollowUpResponse(
                    follow_up_id=item["follow_up_id"],
                    patient_id=item["patient_id"],
                    type=item["type"],
                    title=item["title"],
                    description=item.get("description"),
                    due_date=item["due_date"],
                    scheduled_date=item.get("scheduled_date"),
                    completed_date=item.get("completed_date"),
                    status=item.get("status", "upcoming"),
                    days_overdue_or_remaining=days_delta,
                    care_team_id=item.get("care_team_id"),
                    assigned_doctor_id=item.get("assigned_doctor_id"),
                    medication_details=med_details,
                    adherence_inferred=False,
                    clinical_safety_note="Deterministic schedule tracking only. Adherence is never inferred.",
                    audit_history=item.get("audit_history", []),
                    created_at=item.get("created_at", ""),
                    updated_at=item.get("updated_at", ""),
                )
            )
        return responses

    async def create_followup(
        self,
        payload: FollowUpCreateRequest,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> FollowUpResponse:
        # Non-patients and patients must be authorized
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=payload.patient_id,
            resource_path="/api/v1/followups",
            client_ip=client_ip,
        )

        now_str = datetime.now(timezone.utc).isoformat()
        follow_up_id = f"FOL-{uuid.uuid4().hex[:10].upper()}"

        days_delta = self._calculate_days_delta(payload.due_date)
        initial_status = "overdue" if days_delta < 0 else "upcoming"

        doc = {
            "follow_up_id": follow_up_id,
            "patient_id": payload.patient_id,
            "type": payload.type,
            "title": payload.title,
            "description": payload.description,
            "due_date": payload.due_date,
            "scheduled_date": payload.scheduled_date,
            "completed_date": None,
            "status": initial_status,
            "care_team_id": payload.care_team_id,
            "assigned_doctor_id": payload.assigned_doctor_id or current_user.get("user_id"),
            "medication_details": payload.medication_details.model_dump() if payload.medication_details else None,
            "adherence_inferred": False,
            "clinical_safety_note": "Deterministic schedule tracking only. Adherence is never inferred.",
            "audit_history": [
                {
                    "from_status": "none",
                    "to_status": initial_status,
                    "reason": "Initial creation by clinician/schedule",
                    "changed_by": current_user.get("user_id", "SYSTEM"),
                    "changed_at": now_str,
                }
            ],
            "created_by": current_user.get("user_id", "SYSTEM"),
            "created_at": now_str,
            "updated_at": now_str,
        }

        await followup_repository.create_followup(doc)

        await audit_service.log_event(
            event_type="FOLLOWUP_CREATED",
            user_id=current_user.get("user_id", "SYSTEM"),
            role=current_user.get("role", "unknown"),
            details={
                "patient_id": payload.patient_id,
                "action": "CREATE",
                "resource": f"/api/v1/followups/{follow_up_id}",
                "type": payload.type,
                "title": payload.title,
                "due_date": payload.due_date,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        return FollowUpResponse(
            follow_up_id=follow_up_id,
            patient_id=payload.patient_id,
            type=payload.type,
            title=payload.title,
            description=payload.description,
            due_date=payload.due_date,
            scheduled_date=payload.scheduled_date,
            completed_date=None,
            status=initial_status,
            days_overdue_or_remaining=days_delta,
            care_team_id=payload.care_team_id,
            assigned_doctor_id=payload.assigned_doctor_id,
            medication_details=payload.medication_details,
            adherence_inferred=False,
            clinical_safety_note="Deterministic schedule tracking only. Adherence is never inferred.",
            audit_history=doc["audit_history"],
            created_at=now_str,
            updated_at=now_str,
        )

    async def update_followup_status(
        self,
        follow_up_id: str,
        payload: FollowUpStatusUpdateRequest,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> FollowUpResponse:
        item = await followup_repository.get_by_id(follow_up_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up record not found")

        # Patients cannot defer or complete clinical follow-ups without clinician authority
        if current_user.get("role") == "patient" and payload.status in ("deferred", "needs_review"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only clinicians can defer or flag follow-up reviews."
            )

        await patient_service.check_patient_access(
            user=current_user,
            patient_id=item["patient_id"],
            resource_path=f"/api/v1/followups/{follow_up_id}/status",
            client_ip=client_ip,
        )

        if payload.status == "deferred" and not payload.new_due_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A new target due date is required when deferring a follow-up."
            )

        now_str = datetime.now(timezone.utc).isoformat()
        audit_entry = {
            "from_status": item.get("status", "unknown"),
            "to_status": payload.status,
            "reason": payload.reason,
            "changed_by": current_user.get("user_id", "SYSTEM"),
            "changed_at": now_str,
        }

        completed_date = now_str[:10] if payload.status == "completed" else None
        await followup_repository.update_status(
            follow_up_id=follow_up_id,
            status=payload.status,
            audit_entry=audit_entry,
            new_due_date=payload.new_due_date,
            completed_date=completed_date,
        )

        await audit_service.log_event(
            event_type="FOLLOWUP_STATUS_UPDATED",
            user_id=current_user.get("user_id", "SYSTEM"),
            role=current_user.get("role", "unknown"),
            details={
                "patient_id": item["patient_id"],
                "action": "UPDATE",
                "resource": f"/api/v1/followups/{follow_up_id}/status",
                "follow_up_id": follow_up_id,
                "from_status": item.get("status"),
                "to_status": payload.status,
                "reason": payload.reason,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        updated_item = await followup_repository.get_by_id(follow_up_id)
        days_delta = self._calculate_days_delta(updated_item.get("due_date", ""))
        med_details = None
        if updated_item.get("medication_details"):
            med_details = MedicationCourseDetails(**updated_item["medication_details"])

        return FollowUpResponse(
            follow_up_id=updated_item["follow_up_id"],
            patient_id=updated_item["patient_id"],
            type=updated_item["type"],
            title=updated_item["title"],
            description=updated_item.get("description"),
            due_date=updated_item["due_date"],
            scheduled_date=updated_item.get("scheduled_date"),
            completed_date=updated_item.get("completed_date"),
            status=updated_item.get("status", "upcoming"),
            days_overdue_or_remaining=days_delta,
            care_team_id=updated_item.get("care_team_id"),
            assigned_doctor_id=updated_item.get("assigned_doctor_id"),
            medication_details=med_details,
            adherence_inferred=False,
            clinical_safety_note="Deterministic schedule tracking only. Adherence is never inferred.",
            audit_history=updated_item.get("audit_history", []),
            created_at=updated_item.get("created_at", ""),
            updated_at=updated_item.get("updated_at", ""),
        )

    async def evaluate_with_agent(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        request_id: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> FollowUpEvaluationResult:
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path=f"/api/v1/followups/patient/{patient_id}/evaluate",
            client_ip=client_ip,
        )
        return await followup_tracking_agent.evaluate_patient(
            patient_id=patient_id,
            request_id=request_id,
        )


followup_service = FollowUpService()
