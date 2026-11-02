from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from backend.app.core.database import get_database
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.prescription_repository import prescription_repository
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.repositories.timeline_conflict_repository import timeline_conflict_repository
from backend.app.safety.rules_engine import DrugReferenceCatalog
from backend.app.schemas.timeline_audit import (
    AuditedTimelineEvent,
    ConflictEventRef,
    ConflictMarker,
    TimelineAuditReport,
    TimelineConflict,
)
from backend.app.services.audit_service import audit_service


class TimelineAuditService:
    def __init__(self):
        self.catalog = DrugReferenceCatalog()

    def _normalize_drug(self, name: str) -> str:
        if not name:
            return ""
        clean = name.split("(")[0].strip()
        tokens = re.split(r"\s+", clean)
        base = tokens[0] if tokens else clean
        return self.catalog.normalize_drug_name(base)

    async def get_patient_timeline_audit(
        self,
        patient_id: str,
        current_user: dict,
        hospital_id_filter: Optional[str] = None,
        department_filter: Optional[str] = None,
        event_type_filter: Optional[str] = None,
        conflict_only: bool = False,
        client_ip: Optional[str] = None,
    ) -> TimelineAuditReport:
        """
        Builds chronological timeline across all hospitals and specialties.
        Preserves all conflicting records, detects inconsistencies, and attaches conflict markers.
        INVARIANT: Does NOT assume newest is correct; human decision required.
        """
        patient = await patient_repository.get_by_patient_id(patient_id)
        if not patient:
            raise ValueError(f"Patient {patient_id} not found")

        # 1. Fetch raw data across collections
        encounters = await encounter_repository.get_patient_encounters(patient_id=patient_id, limit=200)
        prescriptions = await prescription_repository.get_by_patient(patient_id=patient_id, limit=200)
        approved_records = await record_version_repository.get_patient_approved_records(
            patient_id=patient_id, limit=200
        )

        # Hospital metadata lookup
        hosp_ids = set()
        for e in encounters:
            if e.get("hospital_id"):
                hosp_ids.add(e["hospital_id"])
        for p in prescriptions:
            if p.get("hospital_id"):
                hosp_ids.add(p["hospital_id"])
        for r in approved_records:
            if r.get("hospital_id"):
                hosp_ids.add(r["hospital_id"])

        hospitals = await organization_repository.get_by_hospital_ids(list(hosp_ids))
        hosp_map = {h["hospital_id"]: h["name"] for h in hospitals}

        # 2. Extract and detect timeline conflicts
        conflicts = await self._detect_all_conflicts(
            patient_id=patient_id,
            encounters=encounters,
            prescriptions=prescriptions,
            approved_records=approved_records,
            hosp_map=hosp_map,
        )

        # Check existing persisted resolutions
        persisted_conflicts = await timeline_conflict_repository.get_by_patient(patient_id=patient_id)
        persisted_map = {c["conflict_id"]: c for c in persisted_conflicts}

        # Save/update detected conflicts in repository and sync resolution status
        final_conflicts: List[TimelineConflict] = []
        for conf in conflicts:
            conf_id = conf.conflict_id
            if conf_id in persisted_map:
                persisted = persisted_map[conf_id]
                if persisted.get("status") == "resolved":
                    conf.status = "resolved"
                    conf.resolution = persisted.get("resolution")
                    conf.resolved_by = persisted.get("resolved_by")
                    conf.resolved_at = persisted.get("resolved_at")
                    conf.resolved_reason = persisted.get("resolved_reason")
            await timeline_conflict_repository.upsert_conflict(conf.model_dump())
            final_conflicts.append(conf)

        # Build mapping of event_id -> List[ConflictMarker]
        event_conflict_markers: Dict[str, List[ConflictMarker]] = {}
        for conf in final_conflicts:
            marker = ConflictMarker(
                conflict_id=conf.conflict_id,
                rule_id=conf.rule_id,
                label=f"Conflict: {conf.title}",
                type=conf.conflict_type,
                explanation=conf.explanation,
                warning=conf.warning,
            )
            for ev in conf.events_involved:
                event_conflict_markers.setdefault(ev.event_id, []).append(marker)

        # 3. Assemble unified chronological timeline events
        all_events: List[AuditedTimelineEvent] = []

        # (A) Prescriptions
        for rx in prescriptions:
            rx_id = rx["prescription_id"]
            h_id = rx.get("hospital_id", "HOSP-UNKNOWN")
            h_name = hosp_map.get(h_id, "Medical Facility")
            markers = event_conflict_markers.get(rx_id, [])

            all_events.append(
                AuditedTimelineEvent(
                    event_id=rx_id,
                    event_type="prescription",
                    timestamp=rx.get("start_date") or rx.get("created_at", "").split("T")[0] if isinstance(rx.get("created_at"), str) else rx.get("start_date", "2026-10-01"),
                    title=f"Prescription Order: {rx.get('drug_name')} ({rx.get('dosage')})",
                    department=rx.get("department") or rx.get("notes", "General Medicine"),
                    hospital_id=h_id,
                    hospital_name=h_name,
                    provider_name=rx.get("prescribed_by"),
                    status=rx.get("status", "active"),
                    has_conflict=len(markers) > 0,
                    conflict_markers=markers,
                    details={
                        "drug_name": rx.get("drug_name"),
                        "dosage": rx.get("dosage"),
                        "frequency": rx.get("frequency"),
                        "route": rx.get("route"),
                        "status": rx.get("status"),
                        "notes": rx.get("notes"),
                        "discontinuation_reason": rx.get("discontinuation_reason"),
                        "source_type": rx.get("source_type", "order"),
                    },
                )
            )

        # (B) Clinical Encounters
        for enc in encounters:
            enc_id = enc["encounter_id"]
            h_id = enc.get("hospital_id", "HOSP-UNKNOWN")
            h_name = hosp_map.get(h_id, "Medical Facility")
            markers = event_conflict_markers.get(enc_id, [])

            all_events.append(
                AuditedTimelineEvent(
                    event_id=enc_id,
                    event_type="clinical_encounter",
                    timestamp=enc.get("admission_date", ""),
                    title=f"{enc.get('encounter_type', 'Clinical Encounter')} - {enc.get('department', 'General')}",
                    department=enc.get("department", "General"),
                    hospital_id=h_id,
                    hospital_name=h_name,
                    provider_name=enc.get("attending_doctor_name"),
                    status=enc.get("status", "completed"),
                    has_conflict=len(markers) > 0,
                    conflict_markers=markers,
                    details={
                        "chief_complaint": enc.get("chief_complaint"),
                        "admission_date": enc.get("admission_date"),
                        "discharge_date": enc.get("discharge_date"),
                        "diagnosis_codes": enc.get("diagnosis_codes", []),
                    },
                )
            )

        # (C) Verified Clinical Records
        for rec in approved_records:
            rec_id = rec["version_id"]
            h_id = rec.get("hospital_id", "HOSP-UNKNOWN")
            h_name = hosp_map.get(h_id, "Medical Facility")
            markers = event_conflict_markers.get(rec_id, [])
            ts = rec.get("clinical_timestamp") or (
                rec["reviewed_at"].strftime("%Y-%m-%d %H:%M") if rec.get("reviewed_at") else ""
            )

            all_events.append(
                AuditedTimelineEvent(
                    event_id=rec_id,
                    event_type="verified_clinical_record",
                    timestamp=ts,
                    title=f"Verified Record: {rec.get('title', 'Clinical Record')} (v{rec.get('version_number', 1)})",
                    department=rec.get("department", "General"),
                    hospital_id=h_id,
                    hospital_name=h_name,
                    provider_name=rec.get("reviewer_name") or rec.get("submitter_name"),
                    status="approved",
                    has_conflict=len(markers) > 0,
                    conflict_markers=markers,
                    details={
                        "record_id": rec.get("record_id"),
                        "record_type": rec.get("record_type"),
                        "reviewed_by": rec.get("reviewer_name"),
                        "data": rec.get("data", {}),
                    },
                )
            )

        # 4. Sort chronologically (descending or ascending)
        all_events.sort(key=lambda x: str(x.timestamp), reverse=True)

        # 5. Apply filters
        filtered_events = all_events
        if hospital_id_filter:
            filtered_events = [e for e in filtered_events if e.hospital_id == hospital_id_filter]
        if department_filter:
            filtered_events = [
                e for e in filtered_events if department_filter.lower() in e.department.lower()
            ]
        if event_type_filter:
            filtered_events = [e for e in filtered_events if e.event_type == event_type_filter]
        if conflict_only:
            filtered_events = [e for e in filtered_events if e.has_conflict]

        # Audit log of timeline audit report generation
        await audit_service.log_event(
            event_type="TIMELINE_AUDIT_EVALUATED",
            user_id=current_user.get("user_id", "system"),
            role=current_user.get("role", "unknown"),
            details={
                "patient_id": patient_id,
                "total_events": len(all_events),
                "conflicts_count": len(final_conflicts),
                "client_ip": client_ip,
            },
        )

        hospitals_summary = [{"hospital_id": hid, "name": hosp_map.get(hid, hid)} for hid in hosp_ids]
        departments_summary = sorted(list({e.department for e in all_events if e.department}))

        unresolved_count = sum(1 for c in final_conflicts if c.status == "unresolved")

        return TimelineAuditReport(
            patient_id=patient_id,
            mrn=patient["mrn"],
            patient_name=patient.get("name", "Unknown Patient"),
            total_events=len(all_events),
            conflicts_count=len(final_conflicts),
            unresolved_conflicts_count=unresolved_count,
            hospitals_involved=hospitals_summary,
            departments_involved=departments_summary,
            conflicts=final_conflicts,
            timeline=filtered_events,
        )

    async def _detect_all_conflicts(
        self,
        patient_id: str,
        encounters: List[Dict[str, Any]],
        prescriptions: List[Dict[str, Any]],
        approved_records: List[Dict[str, Any]],
        hosp_map: Dict[str, str],
    ) -> List[TimelineConflict]:
        conflicts: List[TimelineConflict] = []
        now = datetime.now(timezone.utc)

        # ---------------------------------------------------------
        # 1. SCENARIO DETECTION: Stale List Re-import & Status Contradiction
        # Hospital A Active (T1) -> Specialist Discontinues (T2) -> Hospital B Imports Older List (T3)
        # Invariant: Must flag all three dates & sources; do NOT assume newest is correct!
        # ---------------------------------------------------------
        by_drug: Dict[str, List[Dict[str, Any]]] = {}
        for rx in prescriptions:
            norm = self._normalize_drug(rx.get("drug_name", ""))
            if norm:
                by_drug.setdefault(norm, []).append(rx)

        for norm_drug, rx_list in by_drug.items():
            # Sort prescriptions by date ascending
            sorted_rx = sorted(
                rx_list,
                key=lambda x: str(x.get("start_date") or x.get("created_at") or ""),
            )

            # Check for sequence: active (hosp A) -> discontinued (specialist) -> active (hosp B/imported)
            # Or general status contradiction across facilities
            for i in range(len(sorted_rx)):
                for j in range(i + 1, len(sorted_rx)):
                    for k in range(j + 1, len(sorted_rx)):
                        rx1, rx2, rx3 = sorted_rx[i], sorted_rx[j], sorted_rx[k]

                        d1 = rx1.get("start_date", "")[:10]
                        d2 = rx2.get("start_date", "")[:10]
                        d3 = rx3.get("start_date", "")[:10]

                        # Check dates sequence: d1 <= d2 <= d3
                        is_stale_import_scenario = (
                            rx1.get("status") == "active"
                            and rx2.get("status") == "discontinued"
                            and rx3.get("status") == "active"
                            and rx1.get("hospital_id") != rx3.get("hospital_id")
                        )

                        if is_stale_import_scenario:
                            h1_name = hosp_map.get(rx1.get("hospital_id"), "Hospital A")
                            h2_name = hosp_map.get(rx2.get("hospital_id"), "Specialist Facility")
                            h3_name = hosp_map.get(rx3.get("hospital_id"), "Hospital B")

                            s1 = f"{h1_name} ({rx1.get('prescribed_by', 'Inpatient Clinician')})"
                            s2 = f"{h2_name} Specialist ({rx2.get('prescribed_by', 'Specialist')})"
                            s3 = f"{h3_name} ({rx3.get('prescribed_by', 'Imported Chart')})"

                            c_id = f"CONF-STALE-{norm_drug}-{rx1['prescription_id']}-{rx2['prescription_id']}-{rx3['prescription_id']}"

                            events_refs = [
                                ConflictEventRef(
                                    event_id=rx1["prescription_id"],
                                    event_type="prescription",
                                    date=d1,
                                    source=s1,
                                    hospital_id=rx1.get("hospital_id", "HOSP-A"),
                                    hospital_name=h1_name,
                                    department=rx1.get("department", "Inpatient"),
                                    provider_name=rx1.get("prescribed_by"),
                                    status="active",
                                    details={"dosage": rx1.get("dosage"), "notes": rx1.get("notes")},
                                ),
                                ConflictEventRef(
                                    event_id=rx2["prescription_id"],
                                    event_type="prescription",
                                    date=d2,
                                    source=s2,
                                    hospital_id=rx2.get("hospital_id", "HOSP-SPECIALIST"),
                                    hospital_name=h2_name,
                                    department=rx2.get("department", "Specialist Outpatient"),
                                    provider_name=rx2.get("prescribed_by"),
                                    status="discontinued",
                                    details={
                                        "dosage": rx2.get("dosage"),
                                        "discontinuation_reason": rx2.get("discontinuation_reason") or rx2.get("notes"),
                                    },
                                ),
                                ConflictEventRef(
                                    event_id=rx3["prescription_id"],
                                    event_type="prescription",
                                    date=d3,
                                    source=s3,
                                    hospital_id=rx3.get("hospital_id", "HOSP-B"),
                                    hospital_name=h3_name,
                                    department=rx3.get("department", "Intake / Records Import"),
                                    provider_name=rx3.get("prescribed_by"),
                                    status="active",
                                    details={
                                        "dosage": rx3.get("dosage"),
                                        "notes": rx3.get("notes", "Imported legacy list"),
                                    },
                                ),
                            ]

                            explanation = (
                                f"Medication '{norm_drug.title()}' has a severe cross-facility lifecycle conflict: "
                                f"Prescribed active at {h1_name} on {d1}; discontinued by specialist {rx2.get('prescribed_by')} at {h2_name} on {d2} ({rx2.get('discontinuation_reason', 'clinical concern')}); "
                                f"then imported as active from an older medication list at {h3_name} on {d3}. "
                                f"The system flags all three dates and sources and does NOT assume the newest record is correct."
                            )

                            warning = (
                                "DO NOT ASSUME NEWEST RECORD IS CORRECT. External chart import at Hospital B "
                                "may re-introduce an intentionally discontinued medication. Clinician reconciliation required."
                            )

                            conflicts.append(
                                TimelineConflict(
                                    conflict_id=c_id,
                                    patient_id=patient_id,
                                    conflict_type="stale_import_reintroduction",
                                    rule_id="TL-STALE-IMPORT-001",
                                    entity_key=norm_drug,
                                    title=f"Stale List Re-import & Status Conflict: {norm_drug.title()}",
                                    explanation=explanation,
                                    warning=warning,
                                    dates=[d1, d2, d3],
                                    sources=[s1, s2, s3],
                                    events_involved=events_refs,
                                    status="unresolved",
                                    created_at=now,
                                    updated_at=now,
                                )
                            )

            # Pairwise status conflicts if not already in tri-event stale import
            if len(rx_list) >= 2:
                for i in range(len(rx_list)):
                    for j in range(i + 1, len(rx_list)):
                        rxa, rxb = rx_list[i], rx_list[j]
                        if rxa.get("status") == "active" and rxb.get("status") == "discontinued":
                            # check if already covered
                            pair_id = f"CONF-STATUS-{norm_drug}-{rxa['prescription_id']}-{rxb['prescription_id']}"
                            if not any(norm_drug in c.entity_key and c.conflict_type == "stale_import_reintroduction" for c in conflicts):
                                ha = hosp_map.get(rxa.get("hospital_id"), "Hospital")
                                hb = hosp_map.get(rxb.get("hospital_id"), "Hospital")
                                da = str(rxa.get("start_date", ""))[:10]
                                db = str(rxb.get("start_date", ""))[:10]
                                conflicts.append(
                                    TimelineConflict(
                                        conflict_id=pair_id,
                                        patient_id=patient_id,
                                        conflict_type="medication_status_contradiction",
                                        rule_id="TL-STATUS-CONFLICT-001",
                                        entity_key=norm_drug,
                                        title=f"Medication Status Contradiction: {norm_drug.title()}",
                                        explanation=f"Contradictory medication status ('active' at {ha} on {da} vs 'discontinued' at {hb} on {db}).",
                                        warning="Active and discontinued records coexist without explicit cross-facility reconciliation.",
                                        dates=[da, db],
                                        sources=[ha, hb],
                                        events_involved=[
                                            ConflictEventRef(
                                                event_id=rxa["prescription_id"],
                                                event_type="prescription",
                                                date=da,
                                                source=ha,
                                                hospital_id=rxa.get("hospital_id", ""),
                                                hospital_name=ha,
                                                department=rxa.get("department", "General"),
                                                status="active",
                                            ),
                                            ConflictEventRef(
                                                event_id=rxb["prescription_id"],
                                                event_type="prescription",
                                                date=db,
                                                source=hb,
                                                hospital_id=rxb.get("hospital_id", ""),
                                                hospital_name=hb,
                                                department=rxb.get("department", "General"),
                                                status="discontinued",
                                            ),
                                        ],
                                        status="unresolved",
                                        created_at=now,
                                        updated_at=now,
                                    )
                                )

            # Dosing inconsistencies across concurrent active prescriptions
            active_rx = [rx for rx in rx_list if rx.get("status") == "active"]
            if len(active_rx) >= 2:
                for i in range(len(active_rx)):
                    for j in range(i + 1, len(active_rx)):
                        ra, rb = active_rx[i], active_rx[j]
                        if ra.get("dosage") and rb.get("dosage") and ra["dosage"].strip().lower() != rb["dosage"].strip().lower():
                            d_conf_id = f"CONF-DOSE-{norm_drug}-{ra['prescription_id']}-{rb['prescription_id']}"
                            ha = hosp_map.get(ra.get("hospital_id"), "Hospital A")
                            hb = hosp_map.get(rb.get("hospital_id"), "Hospital B")
                            da = str(ra.get("start_date", ""))[:10]
                            db = str(rb.get("start_date", ""))[:10]

                            conflicts.append(
                                TimelineConflict(
                                    conflict_id=d_conf_id,
                                    patient_id=patient_id,
                                    conflict_type="dosing_inconsistency",
                                    rule_id="TL-DOSE-INCONSISTENCY-001",
                                    entity_key=norm_drug,
                                    title=f"Dosing Inconsistency Across Encounters: {norm_drug.title()}",
                                    explanation=f"Conflicting active doses prescribed for '{norm_drug.title()}': {ra.get('dosage')} at {ha} ({da}) vs {rb.get('dosage')} at {hb} ({db}).",
                                    warning="Multiple concurrent active dosages found without documented titration or reconciliation.",
                                    dates=[da, db],
                                    sources=[ha, hb],
                                    events_involved=[
                                        ConflictEventRef(
                                            event_id=ra["prescription_id"],
                                            event_type="prescription",
                                            date=da,
                                            source=ha,
                                            hospital_id=ra.get("hospital_id", ""),
                                            hospital_name=ha,
                                            department=ra.get("department", "General"),
                                            status="active",
                                            details={"dosage": ra.get("dosage")},
                                        ),
                                        ConflictEventRef(
                                            event_id=rb["prescription_id"],
                                            event_type="prescription",
                                            date=db,
                                            source=hb,
                                            hospital_id=rb.get("hospital_id", ""),
                                            hospital_name=hb,
                                            department=rb.get("department", "General"),
                                            status="active",
                                            details={"dosage": rb.get("dosage")},
                                        ),
                                    ],
                                    status="unresolved",
                                    created_at=now,
                                    updated_at=now,
                                )
                            )

        # ---------------------------------------------------------
        # 2. INCONSISTENT DATES DETECTION
        # ---------------------------------------------------------
        for enc in encounters:
            adm = enc.get("admission_date")
            dis = enc.get("discharge_date")
            if adm and dis:
                try:
                    # check if admission > discharge
                    d_adm = datetime.fromisoformat(adm.replace("Z", "+00:00").replace(" ", "T"))
                    d_dis = datetime.fromisoformat(dis.replace("Z", "+00:00").replace(" ", "T"))
                    if d_adm > d_dis:
                        conf_id = f"CONF-DATE-{enc['encounter_id']}"
                        h_name = hosp_map.get(enc.get("hospital_id"), "Facility")
                        conflicts.append(
                            TimelineConflict(
                                conflict_id=conf_id,
                                patient_id=patient_id,
                                conflict_type="date_inconsistency",
                                rule_id="TL-DATE-INCONGRUENCE-001",
                                entity_key=enc["encounter_id"],
                                title=f"Inconsistent Encounter Dates: {enc['encounter_id']}",
                                explanation=f"Admission date ({adm}) is recorded as occurring after discharge date ({dis}) at {h_name}.",
                                warning="Temporal anomaly in admission/discharge logs. Audit trail check required.",
                                dates=[str(adm)[:10], str(dis)[:10]],
                                sources=[h_name],
                                events_involved=[
                                    ConflictEventRef(
                                        event_id=enc["encounter_id"],
                                        event_type="clinical_encounter",
                                        date=str(adm)[:10],
                                        source=h_name,
                                        hospital_id=enc.get("hospital_id", ""),
                                        hospital_name=h_name,
                                        department=enc.get("department", "General"),
                                        status=enc.get("status", "completed"),
                                        details={"admission": adm, "discharge": dis},
                                    )
                                ],
                                status="unresolved",
                                created_at=now,
                                updated_at=now,
                            )
                        )
                except Exception:
                    pass

        return conflicts

    async def resolve_conflict(
        self,
        conflict_id: str,
        resolution_action: str,
        reason: str,
        current_user: dict,
        client_ip: Optional[str] = None,
    ) -> TimelineConflict:
        """
        Clinician resolves a timeline conflict.
        AUDIT: Strictly logged to append-only audit log with user, role, action, and rationale.
        """
        existing = await timeline_conflict_repository.get_by_conflict_id(conflict_id)
        if not existing:
            raise ValueError(f"Conflict {conflict_id} not found")

        resolved_by = current_user.get("user_id", "unknown_clinician")
        updated = await timeline_conflict_repository.resolve_conflict(
            conflict_id=conflict_id,
            resolution_action=resolution_action,
            reason=reason,
            resolved_by=resolved_by,
        )
        if not updated:
            raise RuntimeError(f"Failed to update conflict {conflict_id}")

        # Strict audit logging
        await audit_service.log_event(
            event_type="TIMELINE_CONFLICT_RESOLVED",
            user_id=resolved_by,
            role=current_user.get("role", "doctor"),
            details={
                "conflict_id": conflict_id,
                "patient_id": existing.get("patient_id"),
                "conflict_type": existing.get("conflict_type"),
                "rule_id": existing.get("rule_id"),
                "resolution_action": resolution_action,
                "rationale": reason,
                "client_ip": client_ip,
            },
        )

        return TimelineConflict(**updated)


timeline_audit_service = TimelineAuditService()
