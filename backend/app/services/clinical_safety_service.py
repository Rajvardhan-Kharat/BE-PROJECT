from datetime import datetime, timezone
import logging
import uuid
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from backend.app.repositories.alert_repository import alert_repository
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.prescription_repository import prescription_repository
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.safety.rules_engine import drug_reference_catalog, safety_rules_engine
from backend.app.schemas.alert import ClinicalAlertResponse, SafetyCheckResult
from backend.app.services.audit_service import audit_service
from backend.app.services.patient_service import patient_service

logger = logging.getLogger("vericare.safety_service")


class ClinicalSafetyService:
    async def run_safety_checks(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        custom_prescriptions: Optional[List[Dict[str, Any]]] = None,
        client_ip: Optional[str] = None,
    ) -> SafetyCheckResult:
        """
        Runs deterministic safety rules for patient:
        - Duplicate active prescriptions
        - Allergy vs medication conflicts
        - Listed drug-drug interactions
        - Contradictory status across encounters
        - Dosage / duration inconsistencies
        """
        # 1. Verify caller has authorized scope for patient
        patient = await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path=f"/patients/{patient_id}/safety/run-checks",
            client_ip=client_ip,
        )

        patient_allergies = patient.get("allergies", [])

        # 2. Collect prescriptions from database and approved record versions
        prescriptions = await prescription_repository.get_by_patient(patient_id)

        # If custom prescriptions are supplied in request, merge them
        if custom_prescriptions:
            prescriptions = list(prescriptions) + custom_prescriptions

        # If prescriptions collection is empty for this patient, extract active meds from approved/pending record versions
        if not prescriptions:
            extracted_rx = await self._extract_medications_from_records(patient_id)
            prescriptions.extend(extracted_rx)

        # 3. Retrieve encounters and record versions for cross-encounter conflict checks
        encounters = await encounter_repository.get_patient_encounters(patient_id)
        record_versions = await record_version_repository.get_patient_approved_records(patient_id)

        # 4. Run deterministic rules engine
        generated_alerts = safety_rules_engine.evaluate_all(
            patient_id=patient_id,
            patient_allergies=patient_allergies,
            prescriptions=prescriptions,
            encounters=encounters,
            record_versions=record_versions,
        )

        # 5. Persist alerts idempotently
        now = datetime.now(timezone.utc)
        persisted_alerts: List[Dict[str, Any]] = []
        new_alerts_count = 0

        for candidate in generated_alerts:
            sig = candidate.get("evidence_signature", "")
            existing = await alert_repository.find_existing_alert(
                patient_id=patient_id,
                rule_id=candidate["rule_id"],
                evidence_signature=sig,
            )

            if existing:
                # Retain existing alert state (especially if dismissed or resolved)
                persisted_alerts.append(existing)
            else:
                alert_id = f"ALT-{uuid.uuid4().hex[:8]}"
                doc = {
                    "alert_id": alert_id,
                    "patient_id": patient_id,
                    "rule_id": candidate["rule_id"],
                    "rule_version": candidate["rule_version"],
                    "source": candidate["source"],
                    "type": candidate["type"],
                    "title": candidate["title"],
                    "evidence_signature": sig,
                    "evidence_refs": candidate["evidence_refs"],
                    "explanation": candidate["explanation"],
                    "status": "open",
                    "dismissed_by": None,
                    "dismissed_reason": None,
                    "dismissed_at": None,
                    "resolved_by": None,
                    "resolved_reason": None,
                    "resolved_at": None,
                    "created_at": now,
                    "updated_at": now,
                }
                created = await alert_repository.create(doc)
                persisted_alerts.append(created)
                new_alerts_count += 1

        # 6. Audit safety evaluation
        await audit_service.log_event(
            event_type="SAFETY_CHECKS_EVALUATED",
            user_id=current_user.get("user_id"),
            role=current_user.get("role"),
            details={
                "patient_id": patient_id,
                "rules_evaluated": 5,
                "alerts_generated": len(persisted_alerts),
                "new_alerts": new_alerts_count,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        return SafetyCheckResult(
            patient_id=patient_id,
            rules_evaluated=5,
            rule_set_label=drug_reference_catalog.rule_set_label,
            rule_set_version=drug_reference_catalog.version,
            total_alerts=len(persisted_alerts),
            new_alerts=new_alerts_count,
            alerts=[ClinicalAlertResponse(**a) for a in persisted_alerts],
        )

    async def get_patient_alerts(
        self,
        patient_id: str,
        current_user: Dict[str, Any],
        status_filter: Optional[str] = None,
        type_filter: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> List[ClinicalAlertResponse]:
        """Returns clinical safety alerts for an authorized patient."""
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=patient_id,
            resource_path=f"/patients/{patient_id}/safety/alerts",
            client_ip=client_ip,
        )

        raw_alerts = await alert_repository.get_by_patient(
            patient_id=patient_id,
            status=status_filter,
            alert_type=type_filter,
        )
        return [ClinicalAlertResponse(**a) for a in raw_alerts]

    async def dismiss_alert(
        self,
        alert_id: str,
        reason: str,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> ClinicalAlertResponse:
        """Dismisses an alert with mandatory clinical justification."""
        clean_reason = (reason or "").strip()
        if len(clean_reason) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A detailed clinical rationale is mandatory when dismissing a safety alert.",
            )

        alert = await alert_repository.get_by_alert_id(alert_id)
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Safety alert '{alert_id}' not found.",
            )

        # Check patient scope
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=alert["patient_id"],
            resource_path=f"/safety/alerts/{alert_id}/dismiss",
            client_ip=client_ip,
        )

        user_id = current_user.get("user_id") or "UNKNOWN"
        await alert_repository.dismiss_alert(alert_id=alert_id, user_id=user_id, reason=clean_reason)

        await audit_service.log_event(
            event_type="SAFETY_ALERT_DISMISSED",
            user_id=user_id,
            role=current_user.get("role"),
            details={
                "alert_id": alert_id,
                "rule_id": alert.get("rule_id"),
                "reason": clean_reason,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        updated = await alert_repository.get_by_alert_id(alert_id)
        return ClinicalAlertResponse(**updated)

    async def resolve_alert(
        self,
        alert_id: str,
        reason: str,
        current_user: Dict[str, Any],
        client_ip: Optional[str] = None,
    ) -> ClinicalAlertResponse:
        """Resolves an alert with mandatory clinical remediation reason."""
        clean_reason = (reason or "").strip()
        if len(clean_reason) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A detailed remediation reason is mandatory when resolving a safety alert.",
            )

        alert = await alert_repository.get_by_alert_id(alert_id)
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Safety alert '{alert_id}' not found.",
            )

        # Check patient scope
        await patient_service.check_patient_access(
            user=current_user,
            patient_id=alert["patient_id"],
            resource_path=f"/safety/alerts/{alert_id}/resolve",
            client_ip=client_ip,
        )

        user_id = current_user.get("user_id") or "UNKNOWN"
        await alert_repository.resolve_alert(alert_id=alert_id, user_id=user_id, reason=clean_reason)

        await audit_service.log_event(
            event_type="SAFETY_ALERT_RESOLVED",
            user_id=user_id,
            role=current_user.get("role"),
            details={
                "alert_id": alert_id,
                "rule_id": alert.get("rule_id"),
                "reason": clean_reason,
            },
            status="SUCCESS",
            ip_address=client_ip,
        )

        updated = await alert_repository.get_by_alert_id(alert_id)
        return ClinicalAlertResponse(**updated)

    async def _extract_medications_from_records(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fallback to extract structured prescriptions from approved record versions."""
        extracted: List[Dict[str, Any]] = []
        approved_records = await record_version_repository.get_patient_approved_records(patient_id)

        for rec in approved_records:
            data = rec.get("data", {})
            meds_list = data.get("discharge_medications", [])
            for idx, med_str in enumerate(meds_list):
                extracted.append({
                    "prescription_id": f"RX-REC-{rec['version_id']}-{idx}",
                    "patient_id": patient_id,
                    "record_id": rec.get("record_id"),
                    "drug_name": med_str,
                    "dosage": med_str,
                    "frequency": "daily",
                    "status": "active",
                    "prescribed_by": rec.get("submitter_name"),
                    "hospital_id": rec.get("hospital_id"),
                })

        return extracted


clinical_safety_service = ClinicalSafetyService()
