import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.agents.agent_logger import AgentRunContext
from backend.app.core.database import get_database
from backend.app.repositories.followup_repository import followup_repository
from backend.app.schemas.followup import (
    FollowUpEvaluationResult,
    FollowUpResponse,
    MedicationCourseDetails,
)

logger = logging.getLogger("vericare.agents.followup")


class FollowUpTrackingAgent:
    """
    Agent 5: Deterministic Follow-Up & Medication-Course Tracking Agent.

    CLINICAL SAFETY MANDATE:
    Never infers medication adherence or compliance. Does not predict whether
    a patient took prescribed doses. Evaluates strictly documented calendar dates,
    authorized courses, and clinician-recorded actions.
    """

    def __init__(self):
        self.agent_name = "agent_5_followup_tracking"

    async def evaluate_patient(
        self,
        patient_id: str,
        request_id: Optional[str] = None,
        reference_date: Optional[date] = None,
    ) -> FollowUpEvaluationResult:
        run_ctx = AgentRunContext(
            agent_name=self.agent_name,
            request_id=request_id,
            patient_id=patient_id,
        )
        await run_ctx.save_started()

        ref_date = reference_date or datetime.now(timezone.utc).date()
        ref_date_str = ref_date.isoformat()

        db = await get_database()

        # Tool 1: Evaluate existing follow-up records in database
        tool_start = datetime.now(timezone.utc)
        existing_items = await followup_repository.list_by_patient(patient_id=patient_id)
        run_ctx.record_tool_call(
            tool_name="fetch_existing_followups",
            input_params={"patient_id": patient_id, "ref_date": ref_date_str},
            output_summary=f"Retrieved {len(existing_items)} existing tracked items",
        )

        upcoming_count = 0
        overdue_count = 0
        needs_review_count = 0
        completed_count = 0
        deferred_count = 0

        # Tool 2: Deterministic evaluation and date delta computation
        for item in existing_items:
            run_ctx.add_input_ref(item.get("follow_up_id", ""))
            due_str = item.get("due_date", "")
            current_status = item.get("status", "upcoming")

            if current_status == "completed":
                completed_count += 1
                continue
            if current_status == "deferred":
                deferred_count += 1
                continue
            if current_status == "needs_review":
                needs_review_count += 1
                continue

            # Compute calendar status
            try:
                target_date = datetime.strptime(due_str[:10], "%Y-%m-%d").date()
                if target_date < ref_date:
                    computed_status = "overdue"
                    overdue_count += 1
                else:
                    computed_status = "upcoming"
                    upcoming_count += 1

                # Update status in db if changed from upcoming to overdue
                if computed_status != current_status:
                    audit_entry = {
                        "from_status": current_status,
                        "to_status": computed_status,
                        "reason": f"Deterministic schedule check: target date {due_str} is past reference date {ref_date_str}. Adherence is not inferred.",
                        "changed_by": "AGENT-5-DETERMINISTIC",
                        "changed_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await followup_repository.update_status(
                        follow_up_id=item["follow_up_id"],
                        status=computed_status,
                        audit_entry=audit_entry,
                    )
            except Exception as e:
                logger.warning("Date parse error for item %s: %s", item.get("follow_up_id"), e)
                needs_review_count += 1

        run_ctx.record_tool_call(
            tool_name="compute_calendar_deltas",
            input_params={"reference_date": ref_date_str},
            output_summary=(
                f"Calculated: {upcoming_count} upcoming, {overdue_count} overdue, "
                f"{needs_review_count} needs review, {completed_count} completed, {deferred_count} deferred."
            ),
        )

        summary_text = (
            f"Evaluated {len(existing_items)} tracked events for patient {patient_id}. "
            f"{upcoming_count} upcoming, {overdue_count} overdue, {needs_review_count} flagged for review. "
            "Adherence is never inferred."
        )

        await run_ctx.complete_success(summary=summary_text)

        return FollowUpEvaluationResult(
            patient_id=patient_id,
            evaluation_timestamp=datetime.now(timezone.utc).isoformat(),
            total_tracked=len(existing_items),
            upcoming_count=upcoming_count,
            overdue_count=overdue_count,
            needs_review_count=needs_review_count,
            completed_count=completed_count,
            deferred_count=deferred_count,
            adherence_inferred=False,
            summary=summary_text,
        )


followup_tracking_agent = FollowUpTrackingAgent()
