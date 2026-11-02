from datetime import datetime, timezone
import logging
import uuid
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.safety.governance import (
    VERIFIER_SPECIALTY_AUTHORITY,
    check_self_approval_restriction,
    check_verifier_authority,
    is_role_verifier,
)
from backend.app.schemas.verification import (
    RecordComparisonResponse,
    RecordHistoryItem,
    RecordHistoryResponse,
    RecordVersionResponse,
    VerificationQueueItem,
)
from backend.app.services.audit_service import audit_service
from backend.app.services.patient_service import patient_service

logger = logging.getLogger("vericare.verification")


class VerificationService:
    async def submit_record_for_verification(
        self,
        patient_id: str,
        record_type: str,
        title: str,
        department: str,
        hospital_id: str,
        data: Dict[str, Any],
        current_user: Dict[str, Any],
        record_id: Optional[str] = None,
        care_team_id: Optional[str] = None,
        source_document_id: Optional[str] = None,
        source_text_snippet: Optional[str] = None,
        extracted_fields: Optional[List[Dict[str, Any]]] = None,
        clinical_timestamp: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Submits a clinical proposal for verifier review (pending_review).
        INVARIANTS:
        - Enforces patient scope check.
        - Enforces Old Import Invariant: Older imports cannot overwrite newer reviewed records.
        - Saved strictly as pending_review in append-only record_versions collection.
        """
        # 1. Scope check for patient
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path="/verification/submit",
            client_ip=client_ip,
        )

        now = datetime.now(timezone.utc)
        effective_time_str = clinical_timestamp or now.isoformat()

        # 2. Assign or validate logical record_id
        if not record_id:
            dept_prefix = department[:4].upper().replace(" ", "")
            record_id = f"REC-{patient_id[:7]}-{dept_prefix}-{uuid.uuid4().hex[:6]}"

        # 3. Old Import Invariant: Check existing approved version
        existing_approved = await record_version_repository.get_latest_approved(record_id)
        if existing_approved:
            approved_time_str = (
                existing_approved.get("clinical_timestamp")
                or (existing_approved.get("reviewed_at").isoformat() if existing_approved.get("reviewed_at") else None)
                or ""
            )
            # If the submitted data timestamp is older than the existing approved record timestamp
            if effective_time_str and approved_time_str and effective_time_str < approved_time_str:
                logger.warning(
                    "Stale import blocked: import timestamp (%s) < existing approved timestamp (%s) for record %s",
                    effective_time_str,
                    approved_time_str,
                    record_id,
                )
                await audit_service.log_event(
                    event_type="STALE_IMPORT_OVERWRITE_BLOCKED",
                    user_id=current_user.get("user_id"),
                    role=current_user.get("role"),
                    details={
                        "record_id": record_id,
                        "patient_id": patient_id,
                        "import_timestamp": effective_time_str,
                        "approved_timestamp": approved_time_str,
                        "reason": "Old import cannot overwrite newer reviewed record",
                    },
                    status="BLOCKED",
                    ip_address=client_ip,
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Conflict: Submitted data timestamp ({effective_time_str}) is older than active reviewed record v{existing_approved['version_number']} ({approved_time_str}). Stale imports cannot overwrite newer reviewed clinical data.",
                )

        # 4. Calculate version number
        latest_version = await record_version_repository.get_latest_version(record_id)
        version_number = (latest_version["version_number"] + 1) if latest_version else 1
        version_id = f"VER-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"

        doc = {
            "version_id": version_id,
            "record_id": record_id,
            "patient_id": patient_id,
            "version_number": version_number,
            "status": "pending_review",
            "record_type": record_type,
            "title": title,
            "department": department,
            "hospital_id": hospital_id,
            "care_team_id": care_team_id or current_user.get("scope", {}).get("care_team_id"),
            "data": data,
            "source_document_id": source_document_id,
            "source_text_snippet": source_text_snippet,
            "extracted_fields": extracted_fields or [],
            "submitted_by": current_user.get("user_id"),
            "submitter_name": current_user.get("name"),
            "submitted_at": now,
            "reviewed_by": None,
            "reviewer_name": None,
            "reviewed_at": None,
            "review_decision": None,
            "review_reason": None,
            "superseded_by": None,
            "superseded_at": None,
            "clinical_timestamp": effective_time_str,
            "created_at": now,
        }

        created = await record_version_repository.create(doc)

        await audit_service.log_event(
            event_type="PROPOSAL_SUBMITTED_FOR_VERIFICATION",
            user_id=current_user.get("user_id"),
            role=current_user.get("role"),
            details={
                "version_id": version_id,
                "record_id": record_id,
                "patient_id": patient_id,
                "version_number": version_number,
                "department": department,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )
        return created

    async def get_verification_queue(
        self,
        current_user: Dict[str, Any],
        status_filter: Optional[str] = None,
        hospital_id_filter: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[VerificationQueueItem]:
        """
        Retrieves verification queue items scoped to verifier's authority.
        """
        role = current_user.get("role")
        user_scope = current_user.get("scope", {})
        user_specialty = current_user.get("specialty", "")

        hospital_id = hospital_id_filter
        if role == "senior_doctor":
            # Scoped by verifier's hospital
            verifier_hosp = current_user.get("hospital_id") or user_scope.get("hospital_id")
            if verifier_hosp:
                hospital_id = verifier_hosp

        # Allowed specialties
        allowed_specialties = None
        if role == "senior_doctor":
            allowed_specialties = VERIFIER_SPECIALTY_AUTHORITY.get(user_specialty, [user_specialty])

        status_list = [status_filter] if status_filter else ["pending_review", "requires_correction"]

        raw_items = await record_version_repository.get_queue(
            hospital_id=hospital_id,
            specialties=allowed_specialties,
            status_list=status_list,
            skip=skip,
            limit=limit,
        )

        # Bulk load patient names and hospital names for display
        patient_ids = list({item["patient_id"] for item in raw_items})
        hospital_ids = list({item["hospital_id"] for item in raw_items})

        patient_map = {}
        for pid in patient_ids:
            p = await patient_repository.get_by_patient_id(pid)
            if p:
                patient_map[pid] = (p.get("name", "Unknown"), p.get("mrn", "SYN-00000"))

        hospitals = await organization_repository.get_by_hospital_ids(hospital_ids)
        hosp_map = {h["hospital_id"]: h["name"] for h in hospitals}

        queue_items: List[VerificationQueueItem] = []
        for item in raw_items:
            p_name, mrn = patient_map.get(item["patient_id"], ("Patient Record", "SYN-00000"))
            h_name = hosp_map.get(item["hospital_id"], item["hospital_id"])

            # Check if there's a prior approved version for this record_id
            prior_approved = await record_version_repository.get_latest_approved(item["record_id"])

            queue_items.append(
                VerificationQueueItem(
                    version_id=item["version_id"],
                    record_id=item["record_id"],
                    patient_id=item["patient_id"],
                    patient_name=p_name,
                    mrn=mrn,
                    version_number=item["version_number"],
                    status=item["status"],
                    record_type=item["record_type"],
                    title=item["title"],
                    department=item["department"],
                    hospital_id=item["hospital_id"],
                    hospital_name=h_name,
                    submitter_name=item.get("submitter_name"),
                    submitted_by=item.get("submitted_by"),
                    submitted_at=item["submitted_at"],
                    review_reason=item.get("review_reason"),
                    fields_count=len(item.get("extracted_fields", [])),
                    has_prior_approved=prior_approved is not None,
                )
            )

        return queue_items

    async def get_comparison_view(
        self,
        version_id: str,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> RecordComparisonResponse:
        """
        Builds side-by-side comparison data:
        - Source extraction / proposal version
        - Active approved version (if any)
        - Field-by-field diff (current vs proposed)
        - Governance permission indicator
        """
        proposed = await record_version_repository.get_by_version_id(version_id)
        if not proposed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Record version '{version_id}' not found.",
            )

        # Check patient scope
        patient = await patient_service.check_patient_access(
            user=current_user,
            patient_id=proposed["patient_id"],
            resource_path=f"/verification/{version_id}",
            client_ip=client_ip,
        )

        # Active approved version
        current_approved = await record_version_repository.get_latest_approved(proposed["record_id"])

        # Hospital details
        hosp = await organization_repository.get_by_hospital_id(proposed["hospital_id"])
        hosp_name = hosp["name"] if hosp else proposed["hospital_id"]

        # Compute field diffs
        proposed_data = proposed.get("data", {})
        current_data = current_approved.get("data", {}) if current_approved else {}

        all_keys = sorted(list(set(proposed_data.keys()).union(current_data.keys())))
        field_diffs = []
        for key in all_keys:
            c_val = current_data.get(key)
            p_val = proposed_data.get(key)

            if key not in current_data:
                change_type = "added"
            elif key not in proposed_data:
                change_type = "removed"
            elif c_val != p_val:
                change_type = "modified"
            else:
                change_type = "unchanged"

            field_diffs.append({
                "field": key,
                "current_val": c_val,
                "proposed_val": p_val,
                "change_type": change_type,
            })

        # Governance permission check for current user
        can_approve = True
        restriction_reason = None

        role = current_user.get("role")
        user_id = current_user.get("user_id")

        if not is_role_verifier(role):
            can_approve = False
            restriction_reason = f"Role '{role}' is not a senior doctor verifier."
        elif proposed.get("submitted_by") == user_id:
            can_approve = False
            restriction_reason = "Submitter cannot approve their own submission (dual-authorization policy)."
        else:
            try:
                check_verifier_authority(current_user, proposed["department"], proposed["hospital_id"])
            except HTTPException as e:
                can_approve = False
                restriction_reason = e.detail

        return RecordComparisonResponse(
            proposed_version=RecordVersionResponse(**proposed),
            current_approved_version=RecordVersionResponse(**current_approved) if current_approved else None,
            patient_name=patient.get("name", "Patient Record"),
            mrn=patient.get("mrn", "SYN-00000"),
            hospital_name=hosp_name,
            field_diffs=field_diffs,
            can_current_user_approve=can_approve,
            restriction_reason=restriction_reason,
        )

    async def decide_verification(
        self,
        version_id: str,
        decision: str,
        reason: Optional[str],
        human_modifications: Optional[Dict[str, Any]],
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes verifier decision on a proposed record:
        - Reason mandatory on reject and requires_correction.
        - Submitter cannot approve own submission.
        - Verifier authority by specialty/org enforced.
        - Append-only versioning: approving creates a new version and marks older ones superseded.
        - Denials strictly audited.
        """
        proposed = await record_version_repository.get_by_version_id(version_id)
        if not proposed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Record version '{version_id}' not found.",
            )

        # 1. Patient Scope Check
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=proposed["patient_id"],
            resource_path=f"/verification/{version_id}/decide",
            client_ip=client_ip,
        )

        # 2. Reason mandatory check
        if decision in ["rejected", "requires_correction"]:
            clean_reason = (reason or "").strip()
            if len(clean_reason) < 3:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A detailed clinical reason is mandatory when rejecting or requesting corrections.",
                )

        # 3. Submitter cannot approve own submission
        try:
            check_self_approval_restriction(proposed.get("submitted_by"), current_user.get("user_id"))
        except HTTPException as exc:
            await audit_service.log_access_denied_403(
                user_id=current_user.get("user_id"),
                role=current_user.get("role"),
                permission="records:verify",
                resource=f"/verification/{version_id}/decide",
                scope=current_user.get("scope", {}),
                reason="Submitter cannot approve own submission",
                ip_address=client_ip,
            )
            raise exc

        # 4. Governance Authority Check: Role, Organization & Specialty
        try:
            check_verifier_authority(current_user, proposed["department"], proposed["hospital_id"])
        except HTTPException as exc:
            await audit_service.log_access_denied_403(
                user_id=current_user.get("user_id"),
                role=current_user.get("role"),
                permission="records:verify",
                resource=f"/verification/{version_id}/decide",
                scope=current_user.get("scope", {}),
                reason=exc.detail,
                ip_address=client_ip,
            )
            raise exc

        now = datetime.now(timezone.utc)
        record_id = proposed["record_id"]

        # 5. Execute Decision with Append-Only Versioning Invariants
        if decision == "approved":
            # Merge any verified human modifications into data payload
            approved_data = dict(proposed.get("data", {}))
            if human_modifications:
                approved_data.update(human_modifications)

            # Find active approved version (if any) and mark it superseded
            existing_approved = await record_version_repository.get_latest_approved(record_id)
            new_version_id = f"VER-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"

            # Determine next version number
            prev_ver = max(
                proposed["version_number"],
                existing_approved["version_number"] if existing_approved else 0,
            )
            next_version_number = prev_ver + 1

            if existing_approved:
                await record_version_repository.mark_superseded(
                    version_id=existing_approved["version_id"],
                    superseded_by=new_version_id,
                    superseded_at=now,
                )

            # Mark proposed pending version as superseded by the approved version
            await record_version_repository.mark_superseded(
                version_id=proposed["version_id"],
                superseded_by=new_version_id,
                superseded_at=now,
            )

            # Create NEW version with status: approved
            new_approved_doc = {
                "version_id": new_version_id,
                "record_id": record_id,
                "patient_id": proposed["patient_id"],
                "version_number": next_version_number,
                "status": "approved",
                "record_type": proposed["record_type"],
                "title": proposed["title"],
                "department": proposed["department"],
                "hospital_id": proposed["hospital_id"],
                "care_team_id": proposed.get("care_team_id"),
                "data": approved_data,
                "source_document_id": proposed.get("source_document_id"),
                "source_text_snippet": proposed.get("source_text_snippet"),
                "extracted_fields": proposed.get("extracted_fields", []),
                "submitted_by": proposed.get("submitted_by"),
                "submitter_name": proposed.get("submitter_name"),
                "submitted_at": proposed.get("submitted_at"),
                "reviewed_by": current_user.get("user_id"),
                "reviewer_name": current_user.get("name"),
                "reviewed_at": now,
                "review_decision": "approved",
                "review_reason": reason,
                "superseded_by": None,
                "superseded_at": None,
                "clinical_timestamp": proposed.get("clinical_timestamp"),
                "created_at": now,
            }

            created_version = await record_version_repository.create(new_approved_doc)

            await audit_service.log_event(
                event_type="PROPOSAL_APPROVED",
                user_id=current_user.get("user_id"),
                role=current_user.get("role"),
                details={
                    "version_id": new_version_id,
                    "record_id": record_id,
                    "patient_id": proposed["patient_id"],
                    "version_number": next_version_number,
                    "previous_proposal_version": proposed["version_id"],
                },
                status="SUCCESS",
                ip_address=client_ip,
            )
            return created_version

        elif decision == "rejected":
            await record_version_repository.update_one(
                {"version_id": version_id},
                {
                    "status": "rejected",
                    "reviewed_by": current_user.get("user_id"),
                    "reviewer_name": current_user.get("name"),
                    "reviewed_at": now,
                    "review_decision": "rejected",
                    "review_reason": reason,
                },
            )

            await audit_service.log_event(
                event_type="PROPOSAL_REJECTED",
                user_id=current_user.get("user_id"),
                role=current_user.get("role"),
                details={
                    "version_id": version_id,
                    "record_id": record_id,
                    "patient_id": proposed["patient_id"],
                    "reason": reason,
                },
                status="SUCCESS",
                ip_address=client_ip,
            )
            updated = await record_version_repository.get_by_version_id(version_id)
            return updated or {}

        elif decision == "requires_correction":
            await record_version_repository.update_one(
                {"version_id": version_id},
                {
                    "status": "requires_correction",
                    "reviewed_by": current_user.get("user_id"),
                    "reviewer_name": current_user.get("name"),
                    "reviewed_at": now,
                    "review_decision": "requires_correction",
                    "review_reason": reason,
                },
            )

            await audit_service.log_event(
                event_type="PROPOSAL_CORRECTION_REQUESTED",
                user_id=current_user.get("user_id"),
                role=current_user.get("role"),
                details={
                    "version_id": version_id,
                    "record_id": record_id,
                    "patient_id": proposed["patient_id"],
                    "reason": reason,
                },
                status="SUCCESS",
                ip_address=client_ip,
            )
            updated = await record_version_repository.get_by_version_id(version_id)
            return updated or {}

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid verification decision '{decision}'.",
            )

    async def get_record_history(
        self,
        record_id: str,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> RecordHistoryResponse:
        """
        Retrieves complete version history chain for a record.
        """
        versions = await record_version_repository.get_by_record_id(record_id)
        if not versions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Clinical record '{record_id}' not found.",
            )

        patient_id = versions[0]["patient_id"]
        patient = await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path=f"/verification/records/{record_id}/history",
            client_ip=client_ip,
        )

        history_items = [
            RecordHistoryItem(
                version_id=v["version_id"],
                record_id=v["record_id"],
                version_number=v["version_number"],
                status=v["status"],
                title=v["title"],
                data=v.get("data", {}),
                submitted_by=v.get("submitted_by"),
                submitter_name=v.get("submitter_name"),
                submitted_at=v["submitted_at"],
                reviewed_by=v.get("reviewed_by"),
                reviewer_name=v.get("reviewer_name"),
                reviewed_at=v.get("reviewed_at"),
                review_decision=v.get("review_decision"),
                review_reason=v.get("review_reason"),
                superseded_by=v.get("superseded_by"),
                superseded_at=v.get("superseded_at"),
            )
            for v in versions
        ]

        return RecordHistoryResponse(
            record_id=record_id,
            patient_id=patient_id,
            patient_name=patient.get("name", "Patient Record"),
            total_versions=len(history_items),
            versions=history_items,
        )


verification_service = VerificationService()
