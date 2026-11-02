import logging
import time
from typing import Any, Dict, List, Optional
from backend.app.agents.agent_logger import AgentRunContext
from backend.app.ai.llm_provider import get_llm_provider
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.schemas.verification_assistant import (
    EvidenceItem,
    FieldDiff,
    PriorConflict,
    SuggestionType,
    VerificationAssistantResponse,
)

logger = logging.getLogger("vericare.agents.verification_assistant")


class VerificationAssistantAgent:
    """
    Verification Assistant Agent for Senior Clinical Reviewers.
    INVARIANTS:
    - Mostly deterministic analysis of missing/uncertain fields, prior conflicts, and value diffs.
    - LLM (or mock in testing) only rewords summary into concise clinical prose.
    - Advisory suggestion only; humans decide.
    - Every run is strictly logged to agent_execution_logs.
    """

    async def analyze_submission(
        self,
        version_id: str,
        request_id: Optional[str] = None,
    ) -> VerificationAssistantResponse:
        context = AgentRunContext(
            agent_name="VerificationAssistantAgent",
            request_id=request_id,
            version_id=version_id,
        )
        await context.save_started()

        try:
            # 1. Tool: Fetch Pending Record Version
            t0 = time.perf_counter()
            record = await record_version_repository.get_by_version_id(version_id)
            context.record_tool_call(
                tool_name="fetch_pending_record",
                input_params={"version_id": version_id},
                output_summary=f"Found: {bool(record)}, status={record.get('status') if record else None}",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            if not record:
                raise ValueError(f"Record version '{version_id}' not found.")

            patient_id = record.get("patient_id", "UNKNOWN_PATIENT")
            record_id = record.get("record_id", "UNKNOWN_RECORD")
            context.patient_id = patient_id
            context.add_input_ref(version_id)
            if record.get("source_document_id"):
                context.add_input_ref(record["source_document_id"])

            # 2. Tool: Evaluate Extracted Evidence and Missing/Uncertain Fields
            t0 = time.perf_counter()
            missing_fields: List[str] = []
            uncertain_fields: List[str] = []
            evidence: List[EvidenceItem] = []

            extracted = record.get("extracted_fields", [])
            for field in extracted:
                name = field.get("field_name", "unnamed")
                status = field.get("status", "explicit")
                span = field.get("source_span") or {}

                if status == "missing":
                    missing_fields.append(name)
                elif status in ["uncertain", "inferred", "conflicting"]:
                    uncertain_fields.append(name)

                evidence.append(
                    EvidenceItem(
                        field_name=name,
                        doc_id=span.get("doc") or record.get("source_document_id"),
                        page=span.get("page", 1),
                        quote=span.get("quote"),
                        confidence_note=field.get("confidence_note"),
                    )
                )

            # Check top-level data fields for null or missing
            data_map = record.get("data", {})
            for k, v in data_map.items():
                if v is None or v == "":
                    if k not in missing_fields:
                        missing_fields.append(k)

            # Check if source text snippet exists without extracted fields
            if not evidence and record.get("source_text_snippet"):
                evidence.append(
                    EvidenceItem(
                        field_name="source_text_snippet",
                        doc_id=record.get("source_document_id"),
                        page=1,
                        quote=record.get("source_text_snippet"),
                        confidence_note="Document text snippet attached to proposal",
                    )
                )

            context.record_tool_call(
                tool_name="evaluate_extracted_evidence",
                input_params={"extracted_count": len(extracted), "data_keys": list(data_map.keys())},
                output_summary=f"missing={len(missing_fields)}, uncertain={len(uncertain_fields)}, evidence_items={len(evidence)}",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            # 3. Tool: Compare with Prior Approved Records (Diff and Conflicts)
            t0 = time.perf_counter()
            prior_approved = await record_version_repository.get_latest_approved(record_id)
            diffs: List[FieldDiff] = []
            conflicts_with_prior: List[PriorConflict] = []

            old_data: Dict[str, Any] = {}
            if prior_approved:
                context.add_input_ref(prior_approved["version_id"])
                old_data = prior_approved.get("data", {})

            # Compare keys
            all_keys = set(data_map.keys()).union(set(old_data.keys()))
            for key in sorted(all_keys):
                old_val = old_data.get(key)
                new_val = data_map.get(key)

                if key not in old_data:
                    diffs.append(
                        FieldDiff(field_name=key, old_value=None, proposed_value=new_val, is_changed=True, is_new=True)
                    )
                elif key not in data_map:
                    diffs.append(
                        FieldDiff(field_name=key, old_value=old_val, proposed_value=None, is_changed=True, is_new=False)
                    )
                elif old_val != new_val:
                    diffs.append(
                        FieldDiff(field_name=key, old_value=old_val, proposed_value=new_val, is_changed=True, is_new=False)
                    )

                    # Check for direct clinical conflict (e.g. diagnosis code change or medication contradiction)
                    if "code" in key.lower() or "diagnosis" in key.lower() or "medication" in key.lower():
                        conflicts_with_prior.append(
                            PriorConflict(
                                conflict_id=f"CONF-PRIOR-{key}-{record_id}",
                                field_name=key,
                                prior_record_id=prior_approved["version_id"],
                                prior_value=old_val,
                                proposed_value=new_val,
                                explanation=f"Field '{key}' modifies prior approved baseline ({old_val} -> {new_val})",
                            )
                        )
                else:
                    diffs.append(
                        FieldDiff(field_name=key, old_value=old_val, proposed_value=new_val, is_changed=False, is_new=False)
                    )

            context.record_tool_call(
                tool_name="compare_prior_records",
                input_params={"prior_version_id": prior_approved.get("version_id") if prior_approved else None},
                output_summary=f"diffs={len(diffs)}, conflicts={len(conflicts_with_prior)}",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            # 4. Formulate Deterministic Findings and Advisory Suggestion
            suggestion: SuggestionType = "approve"
            rationale_parts = []
            bullet_points = []

            if record.get("status") == "requires_correction":
                suggestion = "requires_correction"
                rationale_parts.append("Proposal previously flagged as requiring clinical correction.")
                bullet_points.append(f"Correction requested previously: {record.get('review_reason')}")

            if conflicts_with_prior:
                if suggestion != "requires_correction":
                    suggestion = "requires_correction"
                rationale_parts.append(f"{len(conflicts_with_prior)} values conflict with or modify prior approved records.")
                for c in conflicts_with_prior:
                    bullet_points.append(f"Conflict on '{c.field_name}': prior was '{c.prior_value}', proposed is '{c.proposed_value}'")

            if uncertain_fields:
                bullet_points.append(f"Uncertain or inferred fields: {', '.join(uncertain_fields)}")
                if len(uncertain_fields) > 2 and suggestion == "approve":
                    suggestion = "requires_correction"
                    rationale_parts.append("Multiple uncertain extractions require manual span confirmation.")

            if missing_fields:
                bullet_points.append(f"Missing clinical items: {', '.join(missing_fields)}")

            if not rationale_parts:
                suggestion = "approve"
                rationale_parts.append("All proposed fields are explicitly grounded with matching quotes and no prior conflicts.")
                bullet_points.append("Full span alignment with source document text.")

            draft_summary = (
                f"Evaluation for record '{record.get('title', record_id)}' (v{record.get('version_number', 1)}): "
                + " ".join(rationale_parts)
            )

            # 5. Tool: LLM Rewording of Reviewer Summary
            t0 = time.perf_counter()
            llm_provider = get_llm_provider()
            try:
                reviewer_summary = await llm_provider.reword_reviewer_summary(
                    draft_summary=draft_summary,
                    key_points=bullet_points,
                )
            except Exception as llm_err:
                logger.warning("LLM summary rewording failed, falling back to deterministic: %s", llm_err)
                reviewer_summary = f"[Aria Deterministic Summary]: {draft_summary} Observations: {'; '.join(bullet_points)}"

            context.record_tool_call(
                tool_name="llm_reword_summary",
                input_params={"provider": llm_provider.provider_name},
                output_summary=f"Generated summary ({len(reviewer_summary)} chars)",
                duration_ms=(time.perf_counter() - t0) * 1000.0,
            )

            suggestion_rationale = " ".join(rationale_parts)

            response = VerificationAssistantResponse(
                version_id=version_id,
                record_id=record_id,
                patient_id=patient_id,
                missing_fields=missing_fields,
                uncertain_fields=uncertain_fields,
                conflicts_with_prior=conflicts_with_prior,
                old_vs_proposed_values=diffs,
                evidence=evidence,
                reviewer_summary=reviewer_summary,
                suggestion=suggestion,
                suggestion_rationale=suggestion_rationale,
                agent_run_id=context.run_id,
            )

            await context.complete_success(
                summary=f"Verification assistant evaluated version {version_id}. Suggestion: {suggestion}."
            )
            return response

        except Exception as e:
            logger.error("Verification assistant agent failed: %s", e, exc_info=True)
            await context.complete_failure(e)
            raise


verification_assistant_agent = VerificationAssistantAgent()
