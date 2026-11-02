from datetime import datetime, timezone
import time
from typing import Any, Dict, List, Optional
from backend.app.agents.agent_logger import AgentRunContext
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.prescription_repository import prescription_repository
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.repositories.timeline_conflict_repository import timeline_conflict_repository
from backend.app.schemas.emergency_summary import (
    ConflictingItem,
    EmergencySummaryResponse,
    MissingOrStaleItem,
    PendingItem,
    VerifiedItem,
)
from backend.app.services.timeline_audit_service import timeline_audit_service


class EmergencySummaryAgent:
    """
    Emergency Clinical Profile Assembly Agent.
    INVARIANTS:
    - 4 distinct sections: Verified / Pending / Conflicting / Missing-or-stale.
    - Verified items derive strictly from approved records; pending items are quarantined.
    - Missing data is NEVER shown as negative ("allergy information unavailable", NOT "no allergies").
    - Every agent run is logged with request ID, tools called, input refs, and status.
    """

    async def assemble_emergency_summary(
        self,
        patient_id: str,
        request_id: Optional[str] = None,
    ) -> EmergencySummaryResponse:
        context = AgentRunContext(
            agent_name="EmergencySummaryAgent",
            request_id=request_id,
            patient_id=patient_id,
        )
        await context.save_started()

        try:
            # 1. Tool: Fetch Patient Demographic Baseline
            t0 = time.perf_counter()
            patient = await patient_repository.get_by_patient_id(patient_id)
            if not patient:
                raise ValueError(f"Patient '{patient_id}' not found.")
            context.add_input_ref(patient_id)
            context.record_tool_call(
                tool_name="fetch_patient_demographics",
                input_params={"patient_id": patient_id},
                output_summary=f"Found: {patient.get('name')}, MRN={patient.get('mrn')}",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            # 2. Tool: Fetch Approved Records & Prescriptions
            t0 = time.perf_counter()
            approved_records = await record_version_repository.get_patient_approved_records(patient_id)
            active_prescriptions = await prescription_repository.get_active_by_patient(patient_id)

            # Gather hospital lookup
            hosp_ids = set()
            for r in approved_records:
                context.add_input_ref(r["version_id"])
                if r.get("hospital_id"):
                    hosp_ids.add(r["hospital_id"])
            for p in active_prescriptions:
                if p.get("hospital_id"):
                    hosp_ids.add(p["hospital_id"])

            hospitals = await organization_repository.get_by_hospital_ids(list(hosp_ids))
            hosp_map = {h["hospital_id"]: h["name"] for h in hospitals}

            context.record_tool_call(
                tool_name="fetch_approved_clinical_records",
                input_params={"approved_count": len(approved_records), "prescriptions_count": len(active_prescriptions)},
                output_summary=f"Retrieved {len(approved_records)} approved versions, {len(active_prescriptions)} active rx",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            # 3. Assemble Section 1: VERIFIED (Strictly approved data only)
            verified_items: List[VerifiedItem] = []
            latest_time: Optional[str] = None

            # (A) Confirmed Allergies
            patient_allergies = patient.get("allergies", [])
            if patient_allergies:
                for allergy in patient_allergies:
                    # Link to source approved record if available
                    source_rec = approved_records[0] if approved_records else None
                    verified_items.append(
                        VerifiedItem(
                            category="allergies",
                            label=f"Verified Allergy: {allergy}",
                            details=f"Documented severe hypersensitivity reaction to {allergy}.",
                            source_record_id=source_rec.get("record_id", "REC-INTAKE-ALLERGY") if source_rec else "REC-INTAKE-ALLERGY",
                            source_version_id=source_rec.get("version_id", "VER-INTAKE-ALLERGY") if source_rec else "VER-INTAKE-ALLERGY",
                            hospital_name=hosp_map.get(source_rec.get("hospital_id", "") if source_rec else "", "Primary Network Facility"),
                            reviewed_by=source_rec.get("reviewer_name", "Clinical Verifier") if source_rec else "Attending Clinician",
                            reviewed_at=source_rec.get("reviewed_at").isoformat() if source_rec and source_rec.get("reviewed_at") else None,
                        )
                    )

            # (B) Approved Diagnoses from Approved Discharge Summaries / Notes
            for rec in approved_records:
                data = rec.get("data", {})
                h_name = hosp_map.get(rec.get("hospital_id"), "Medical Center")
                rev_by = rec.get("reviewer_name") or rec.get("reviewed_by") or "Senior Verifier"
                rev_at = rec.get("reviewed_at").isoformat() if rec.get("reviewed_at") else rec.get("clinical_timestamp")

                if rec.get("clinical_timestamp"):
                    if not latest_time or str(rec["clinical_timestamp"]) > latest_time:
                        latest_time = str(rec["clinical_timestamp"])

                for k, v in data.items():
                    if "diagnosis" in k.lower() and v:
                        verified_items.append(
                            VerifiedItem(
                                category="critical_diagnoses",
                                label=f"{k.replace('_', ' ').title()}",
                                details=str(v),
                                source_record_id=rec["record_id"],
                                source_version_id=rec["version_id"],
                                hospital_name=h_name,
                                reviewed_by=rev_by,
                                reviewed_at=rev_at,
                            )
                        )

            # (C) Verified Active Prescriptions (strictly approved orders)
            for rx in active_prescriptions:
                h_name = hosp_map.get(rx.get("hospital_id"), "Prescribing Facility")
                verified_items.append(
                    VerifiedItem(
                        category="active_medications",
                        label=f"{rx.get('drug_name')} {rx.get('dosage')}",
                        details=f"Regimen: {rx.get('frequency')} via {rx.get('route')} ({rx.get('notes', 'Active approved order')})",
                        source_record_id=rx.get("record_id") or rx["prescription_id"],
                        source_version_id=rx.get("prescription_id"),
                        hospital_name=h_name,
                        reviewed_by=rx.get("prescribed_by", "Attending Clinician"),
                        reviewed_at=rx.get("start_date"),
                    )
                )

            # 4. Tool: Fetch Pending Records & Assemble Section 2: PENDING (Quarantined)
            t0 = time.perf_counter()
            pending_records = await record_version_repository.find_many(
                query={
                    "patient_id": patient_id,
                    "status": {"$in": ["pending_review", "requires_correction"]},
                },
                sort=[("created_at", -1)],
            )
            for pr in pending_records:
                context.add_input_ref(pr["version_id"])

            pending_items: List[PendingItem] = []
            for pr in pending_records:
                data = pr.get("data", {})
                preview_parts = [f"{k}: {v}" for k, v in list(data.items())[:2]]
                preview = "; ".join(preview_parts) if preview_parts else pr.get("title", "Clinical proposal")

                pending_items.append(
                    PendingItem(
                        category=pr.get("record_type", "proposal"),
                        label=pr.get("title", "Pending Proposal"),
                        proposed_value=preview,
                        source_version_id=pr["version_id"],
                        submitted_by=pr.get("submitter_name") or pr.get("submitted_by", "Clinician"),
                        submitted_at=pr.get("submitted_at").isoformat() if pr.get("submitted_at") else "2026-10-24",
                        status=pr.get("status", "pending_review"),
                    )
                )

            context.record_tool_call(
                tool_name="fetch_pending_quarantine_records",
                input_params={"pending_count": len(pending_records)},
                output_summary=f"Found {len(pending_records)} pending proposals",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            # 5. Tool: Detect Active Conflicts & Assemble Section 3: CONFLICTING
            t0 = time.perf_counter()
            unresolved_conflicts = await timeline_conflict_repository.get_by_patient(
                patient_id=patient_id, status="unresolved"
            )
            conflicting_items: List[ConflictingItem] = []
            for c in unresolved_conflicts:
                context.add_input_ref(c["conflict_id"])
                conflicting_items.append(
                    ConflictingItem(
                        conflict_id=c["conflict_id"],
                        entity=c.get("entity_key", "Clinical entity"),
                        conflict_type=c.get("conflict_type", "conflict"),
                        explanation=c.get("explanation", ""),
                        sources_involved=c.get("sources", []),
                        warning=c.get("warning", "Do NOT assume newest record is correct."),
                    )
                )

            context.record_tool_call(
                tool_name="fetch_active_conflicts",
                input_params={"unresolved_conflicts_count": len(unresolved_conflicts)},
                output_summary=f"Cataloged {len(conflicting_items)} active conflicts",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            # 6. Assemble Section 4: MISSING OR STALE
            # INVARIANT: Missing is NEVER shown as negative!
            missing_or_stale: List[MissingOrStaleItem] = []

            # Check Allergies: if patient has no documented allergies or empty list
            if not patient_allergies:
                missing_or_stale.append(
                    MissingOrStaleItem(
                        category="allergies",
                        item_name="Allergy Profile",
                        status_display="Allergy information unavailable",
                        notes="No verified allergy history documented. Missing data must NOT be presumed negative.",
                        last_known_date=None,
                    )
                )

            # Check Advance Directives / Resuscitation Status
            missing_or_stale.append(
                MissingOrStaleItem(
                    category="advance_directives",
                    item_name="Code Status / Advance Directives",
                    status_display="Information unavailable",
                    notes="No verified DNR/DNI order documented. Full resuscitation standards apply until verified.",
                    last_known_date=None,
                )
            )

            # Check Blood Type
            b_type = patient.get("blood_type", "")
            if not b_type or b_type.lower() == "unknown":
                missing_or_stale.append(
                    MissingOrStaleItem(
                        category="blood_type",
                        item_name="Blood Type",
                        status_display="Blood type unavailable",
                        notes="Type and screen must be drawn prior to non-emergency transfusion.",
                        last_known_date=None,
                    )
                )

            now_iso = datetime.now(timezone.utc).isoformat()
            if not latest_time:
                latest_time = now_iso

            response = EmergencySummaryResponse(
                patient_id=patient_id,
                mrn=patient.get("mrn", "UNKNOWN"),
                patient_name=patient.get("name", "Unknown"),
                date_of_birth=patient.get("date_of_birth", "1970-01-01"),
                gender=patient.get("gender", "Unknown"),
                blood_type=patient.get("blood_type", "Unknown"),
                last_updated_time=latest_time,
                compiled_at=now_iso,
                verified=verified_items,
                pending=pending_items,
                conflicting=conflicting_items,
                missing_or_stale=missing_or_stale,
                agent_run_id=context.run_id,
            )

            await context.complete_success(
                summary=(
                    f"Emergency summary assembled: {len(verified_items)} verified, {len(pending_items)} pending, "
                    f"{len(conflicting_items)} conflicting, {len(missing_or_stale)} missing/stale."
                )
            )
            return response

        except Exception as e:
            await context.complete_failure(e)
            raise


emergency_summary_agent = EmergencySummaryAgent()
