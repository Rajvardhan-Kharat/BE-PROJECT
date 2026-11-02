import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.ai.llm_provider import (
    BaseLLMProvider,
    LLMProviderDownError,
    get_llm_provider,
)
from backend.app.schemas.extraction import (
    ExtractedField,
    ExtractionDocumentResult,
    SourceSpan,
)
from backend.app.services.pdf_service import PDFExtractionResult, pdf_service
from backend.app.safety.prompt_injection_detector import prompt_injection_detector
from backend.app.services.audit_service import audit_service

logger = logging.getLogger("vericare.extraction")


class ExtractionService:
    def __init__(self, provider: Optional[BaseLLMProvider] = None):
        self._provider = provider

    def get_provider(self) -> BaseLLMProvider:
        return self._provider or get_llm_provider()

    async def extract_and_verify(
        self,
        document_id: str,
        patient_id: str,
        pdf_extraction: PDFExtractionResult,
        content_hash: str,
        uploader_user_id: Optional[str] = None,
        uploader_role: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> ExtractionDocumentResult:
        """
        Executes bounded extraction workflow:
          1. Pre-scans for adversarial prompt injections and unlisted tool requests
          2. Calls LLM provider abstraction (gracefully handling outages)
          3. Parses output with bounded repair loop (max 2 attempts)
          4. MANDATORY: Validates every source span quote against document text offsets
             Downgrades and rejects ungrounded/hallucinated spans
          5. Enforces security invariants: strictly 'pending_review', never 'approved', logs incidents
        """
        provider = self.get_provider()
        now_str = datetime.now(timezone.utc).isoformat()

        # Step 0: Adversarial Prompt Injection & Tool Allowlist Scan
        detection = prompt_injection_detector.analyze_document_text(
            text=pdf_extraction.full_text,
            page_map=pdf_extraction.page_map,
            doc_id=document_id,
        )

        if detection.is_malicious:
            logger.warning(
                "ADVERSARIAL PROMPT INJECTION DETECTED in doc %s for patient %s. Incident type: %s. Patterns: %s",
                document_id,
                patient_id,
                detection.incident_type,
                detection.detected_patterns,
            )
            try:
                await audit_service.log_security_incident(
                    incident_type=detection.incident_type or "prompt_injection",
                    document_id=document_id,
                    patient_id=patient_id,
                    user_id=uploader_user_id,
                    role=uploader_role,
                    detected_patterns=detection.detected_patterns,
                    action_taken="Adversarial content isolated as inert quoted text. Tool calls refused. Kept in pending_review.",
                    details={
                        "attempted_status_override": detection.attempted_status_override,
                        "attempted_permission_escalation": detection.attempted_permission_escalation,
                        "attempted_cross_patient_exfil": detection.attempted_cross_patient_exfil,
                        "attempted_allergy_deletion": detection.attempted_allergy_deletion,
                        "multilingual_injection": detection.multilingual_injection,
                        "context_overflow_injection": detection.context_overflow_injection,
                        "unlisted_tools_requested": detection.unlisted_tools_requested,
                    },
                    ip_address=client_ip,
                )
            except Exception as audit_err:
                logger.error("Failed to log security incident audit event: %s", audit_err)

        # Step 1: Call LLM Provider
        try:
            raw_json = await provider.extract_clinical_json(
                document_text=pdf_extraction.full_text,
                page_map=pdf_extraction.page_map,
                doc_id=document_id,
            )
        except LLMProviderDownError as down_err:
            logger.error("LLM Provider is down: %s. Failing safely to pending_review.", down_err)
            return ExtractionDocumentResult(
                document_id=document_id,
                patient_id=patient_id,
                status="pending_review",
                fields=[],
                page_count=pdf_extraction.total_pages,
                extracted_text_length=pdf_extraction.total_chars,
                content_hash=content_hash,
                repair_attempts=0,
                provider_name=provider.provider_name,
                created_at=now_str,
                metadata={"provider_down": True, "error": str(down_err)},
            )
        except Exception as exc:
            logger.error("Unexpected LLM extraction failure: %s. Failing safely.", exc, exc_info=True)
            return ExtractionDocumentResult(
                document_id=document_id,
                patient_id=patient_id,
                status="pending_review",
                fields=[],
                page_count=pdf_extraction.total_pages,
                extracted_text_length=pdf_extraction.total_chars,
                content_hash=content_hash,
                repair_attempts=0,
                provider_name=provider.provider_name,
                created_at=now_str,
                metadata={"error": f"LLM extraction error: {str(exc)}"},
            )

        # Step 2: Bounded repair loop (max 2 attempts)
        parsed_payload: Optional[Dict[str, Any]] = None
        repair_attempts = 0
        max_repairs = 2
        current_json = raw_json

        while repair_attempts <= max_repairs:
            try:
                data = json.loads(current_json)
                if isinstance(data, dict) and "fields" in data and isinstance(data["fields"], list):
                    parsed_payload = data
                    break
                else:
                    raise ValueError("JSON must be an object with a 'fields' list")
            except Exception as parse_err:
                if repair_attempts < max_repairs:
                    repair_attempts += 1
                    logger.warning(
                        "Malformed JSON from LLM on doc %s (Attempt %d/%d). Invoking repair loop: %s",
                        document_id,
                        repair_attempts,
                        max_repairs,
                        parse_err,
                    )
                    try:
                        current_json = await provider.repair_malformed_json(current_json, str(parse_err))
                    except Exception as rep_err:
                        logger.error("Repair loop invocation failed: %s", rep_err)
                        break
                else:
                    logger.error(
                        "Exceeded bounded repair loop limit (%d) for doc %s. Failing safely.",
                        max_repairs,
                        document_id,
                    )
                    break

        if parsed_payload is None:
            # Safe failure mode: preserve document as pending_review without crashing
            return ExtractionDocumentResult(
                document_id=document_id,
                patient_id=patient_id,
                status="pending_review",
                fields=[],
                page_count=pdf_extraction.total_pages,
                extracted_text_length=pdf_extraction.total_chars,
                content_hash=content_hash,
                repair_attempts=repair_attempts,
                provider_name=provider.provider_name,
                created_at=now_str,
                metadata={
                    "parse_error": "Malformed JSON could not be repaired after max 2 attempts.",
                    "raw_output_snippet": current_json[:500],
                },
            )

        # Step 3: MANDATORY Grounding Verification of Source Spans
        validated_fields: List[ExtractedField] = []
        raw_fields = parsed_payload.get("fields", [])

        for idx, item in enumerate(raw_fields):
            try:
                field_name = str(item.get("field_name") or f"field_{idx}")
                value = item.get("value")
                confidence_note = str(item.get("confidence_note") or "")
                raw_status = str(item.get("status") or "uncertain").lower()
                if raw_status == "approved":
                    logger.warning(
                        "FORBIDDEN STATUS 'approved' attempted on field '%s'. Forcibly downgrading to 'uncertain'.",
                        field_name,
                    )
                    status = "uncertain"
                    confidence_note = (
                        f"[SECURITY OVERRIDE: Status 'approved' is prohibited in extraction results] {confidence_note}"
                    )
                else:
                    status = (
                        raw_status
                        if raw_status in ["explicit", "inferred", "uncertain", "missing", "conflicting"]
                        else "uncertain"
                    )

                raw_span = item.get("source_span")
                source_span: Optional[SourceSpan] = None
                grounding_verified = False

                if raw_span and isinstance(raw_span, dict):
                    try:
                        span = SourceSpan(
                            doc=str(raw_span.get("doc") or document_id),
                            page=int(raw_span.get("page") or 1),
                            start=int(raw_span.get("start") or 0),
                            end=int(raw_span.get("end") or 0),
                            quote=str(raw_span.get("quote") or ""),
                        )

                        # VERIFY QUOTE AT OFFSET IN DOCUMENT TEXT
                        is_valid, reason = pdf_service.verify_quote_at_offset(
                            page_num=span.page,
                            start_char=span.start,
                            end_char=span.end,
                            quote=span.quote,
                            page_map=pdf_extraction.page_map,
                        )

                        if is_valid:
                            grounding_verified = True
                            source_span = span
                        else:
                            # MANDATORY REJECTION / DOWNGRADE
                            logger.warning(
                                "MANDATORY SPAN REJECTION: Field '%s' quote '%s' is NOT at offset [%d:%d] on page %d: %s. "
                                "Downgrading status to 'uncertain' and discarding ungrounded span.",
                                field_name,
                                span.quote,
                                span.start,
                                span.end,
                                span.page,
                                reason,
                            )
                            status = "uncertain"
                            confidence_note = (
                                f"[GROUNDING FAILED: Quote mismatch at page {span.page} offset {span.start}:{span.end}] "
                                f"{confidence_note}"
                            )
                            source_span = None
                            grounding_verified = False
                    except Exception as span_err:
                        logger.warning("Invalid source_span format for field '%s': %s", field_name, span_err)
                        status = "uncertain"
                        confidence_note = f"[MALFORMED SPAN: {span_err}] {confidence_note}"
                        source_span = None

                validated_fields.append(
                    ExtractedField(
                        field_name=field_name,
                        value=value,
                        confidence_note=confidence_note,
                        status=status,
                        source_span=source_span,
                        grounding_verified=grounding_verified,
                    )
                )
            except Exception as f_err:
                logger.error("Error parsing clinical field item %d: %s", idx, f_err)

        # Step 4: Ensure all detected adversarial snippets appear as quoted content flagged for reviewer
        if detection.is_malicious:
            existing_quotes = {f.source_span.quote for f in validated_fields if f.source_span and f.source_span.quote}
            for snippet in detection.injected_snippets:
                quote = snippet["quote"]
                if quote not in existing_quotes:
                    is_valid, _ = pdf_service.verify_quote_at_offset(
                        page_num=snippet["page"],
                        start_char=snippet["start"],
                        end_char=snippet["end"],
                        quote=quote,
                        page_map=pdf_extraction.page_map,
                    )
                    source_span = (
                        SourceSpan(
                            doc=document_id,
                            page=snippet["page"],
                            start=snippet["start"],
                            end=snippet["end"],
                            quote=quote,
                        )
                        if is_valid
                        else None
                    )

                    validated_fields.append(
                        ExtractedField(
                            field_name="untrusted_adversarial_instruction",
                            value=quote,
                            confidence_note=(
                                f"[SECURITY ADVISORY: Potential Prompt Injection / Adversarial Instruction Detected ({snippet['category']}) - "
                                f"Quoted as inert text for clinician review. Action was blocked.]"
                            ),
                            status="uncertain",
                            source_span=source_span,
                            grounding_verified=is_valid,
                        )
                    )
                    existing_quotes.add(quote)

        return ExtractionDocumentResult(
            document_id=document_id,
            patient_id=patient_id,
            status="pending_review",  # INVARIANT: Always pending_review
            fields=validated_fields,
            page_count=pdf_extraction.total_pages,
            extracted_text_length=pdf_extraction.total_chars,
            content_hash=content_hash,
            repair_attempts=repair_attempts,
            provider_name=provider.provider_name,
            created_at=now_str,
            metadata={"total_fields_extracted": len(validated_fields)},
        )


extraction_service = ExtractionService()
