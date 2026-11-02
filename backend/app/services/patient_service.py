from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4
from fastapi import HTTPException, status
from backend.app.repositories.break_glass_repository import break_glass_repository
from backend.app.repositories.care_team_repository import care_team_repository
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.repositories.record_version_repository import record_version_repository
from backend.app.services.audit_service import audit_service
from backend.app.services.consent_service import consent_service


class PatientService:
    async def get_accessible_patient_ids(self, user: Dict[str, Any]) -> Optional[List[str]]:
        """
        Determines the explicit list of patient_ids accessible by the user's role and scope.
        Returns:
            - List of patient_ids if caller's scope restricts them to a set of patients
            - None if caller is scoped by organization (e.g. hospital_admin) or unrestricted (system_admin)
        """
        role = user.get("role")
        scope = user.get("scope", {})

        if role == "patient":
            # Patient can only ever see their own patient_id
            patient_id = scope.get("patient_id")
            return [patient_id] if patient_id else []

        if role in ["doctor", "senior_doctor"]:
            # Clinician can only see patients belonging to their care team(s)
            care_team_id = scope.get("care_team_id")
            clinician_id = user.get("user_id")
            patient_ids = await care_team_repository.get_clinician_patient_ids(
                clinician_id=clinician_id,
                care_team_id=care_team_id,
            )
            return patient_ids

        # hospital_admin and system_admin are not restricted to explicit patient ID lists
        return None

    async def check_patient_access(
        self,
        user: Dict[str, Any],
        patient_id: str,
        resource_path: str = "",
        client_ip: Optional[str] = None,
        category: str = "*",
        purpose: str = "treatment",
    ) -> Dict[str, Any]:
        """
        Verifies whether caller has authorized scope to view or operate on patient_id.
        Enforces:
          1. Patient existence check
          2. Patient consent check (subsystem verification on every read)
          3. Patient self-only scope check
          4. Doctor care-team membership check with break-glass override fallback
          5. Hospital admin facility check
        Any scope denial strictly triggers an audit event and raises 403 Forbidden.
        """
        role = user.get("role")
        user_id = user.get("user_id")
        user_scope = user.get("scope", {})

        patient = await patient_repository.get_by_patient_id(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient record '{patient_id}' not found.",
            )

        # 1. Global Patient Consent Check
        if not patient.get("active_consent", True) and role != "system_admin":
            await audit_service.log_access_denied_403(
                user_id=user_id,
                role=role,
                permission="records:read",
                resource=resource_path or f"/patients/{patient_id}",
                scope=user_scope,
                reason=f"Patient '{patient_id}' has revoked active clinical consent",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Patient clinical consent is inactive or revoked (audited).",
            )

        # 2. Patient Role Scope: Only self
        if role == "patient":
            user_patient_id = user_scope.get("patient_id")
            if user_patient_id != patient_id:
                await audit_service.log_access_denied_403(
                    user_id=user_id,
                    role=role,
                    permission="records:read_own",
                    resource=resource_path or f"/patients/{patient_id}",
                    scope=user_scope,
                    reason=f"Patient '{user_id}' attempted cross-patient access to '{patient_id}'",
                    ip_address=client_ip,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Patients may only access their own health records (audited).",
                )
            return patient

        # 3. Doctor & Senior Doctor Scope: Care team check OR active Break-Glass override
        if role in ["doctor", "senior_doctor"]:
            clinician_id = user_id
            care_team_id = user_scope.get("care_team_id")
            is_assigned = await care_team_repository.is_clinician_assigned_to_patient(
                patient_id=patient_id,
                clinician_id=clinician_id,
                care_team_id=care_team_id,
            )

            # Check if an active break-glass session exists for this clinician and patient
            active_bg = await break_glass_repository.find_active_session(
                patient_id=patient_id, clinician_id=clinician_id
            )

            if not is_assigned:
                if active_bg:
                    # Break-glass override is active!
                    # SECURITY INVARIANT 1: Break-glass NEVER allows access to raw Aria data or private notes!
                    lowered_res = resource_path.lower()
                    if any(x in lowered_res for x in ["/documents/", "/raw", "aria", "private_note"]):
                        await audit_service.log_access_denied_403(
                            user_id=user_id,
                            role=role,
                            permission="records:read_raw",
                            resource=resource_path,
                            scope=user_scope,
                            reason="Break-glass emergency access prohibited from viewing raw Aria data or private notes",
                            ip_address=client_ip,
                        )
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: Break-glass emergency access is strictly limited to emergency summaries and active medications. Access to raw Aria data and private notes is prohibited (audited).",
                        )

                    # SECURITY INVARIANT 2: Normal patient overview/timeline access remains strictly DENIED!
                    # Break-glass is strictly limited to emergency views (/emergency-summary, /break-glass-view)
                    is_emergency_resource = any(
                        x in lowered_res for x in ["/emergency-summary", "/break-glass-view"]
                    )
                    if not is_emergency_resource:
                        await audit_service.log_access_denied_403(
                            user_id=user_id,
                            role=role,
                            permission="records:read",
                            resource=resource_path or f"/patients/{patient_id}",
                            scope=user_scope,
                            reason="Break-glass emergency access is strictly limited to emergency clinical summaries. Normal chart access remains restricted.",
                            ip_address=client_ip,
                        )
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: Break-glass emergency access is strictly limited to the emergency clinical summary. Standard patient chart access remains restricted (audited).",
                        )

                    # Permitted under emergency break-glass override
                    return patient

                # Not assigned and no break glass -> strictly deny
                await audit_service.log_access_denied_403(
                    user_id=user_id,
                    role=role,
                    permission="records:read",
                    resource=resource_path or f"/patients/{patient_id}",
                    scope=user_scope,
                    reason=f"Clinician '{user_id}' (care_team='{care_team_id}') is not assigned to patient '{patient_id}' care team",
                    ip_address=client_ip,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Clinician is not assigned to this patient's care team (audited).",
                )

            # Clinician IS assigned to care team: verify granular Consent Subsystem
            recipient_id = user_scope.get("hospital_id") or user_id
            has_consent = await consent_service.check_read_consent(
                patient_id=patient_id,
                recipient=recipient_id,
                purpose=purpose,
                category=category,
            )
            if not has_consent and not active_bg:
                await audit_service.log_access_denied_403(
                    user_id=user_id,
                    role=role,
                    permission="records:read",
                    resource=resource_path or f"/patients/{patient_id}",
                    scope=user_scope,
                    reason=f"Patient '{patient_id}' has revoked or not granted consent for recipient '{recipient_id}' (category='{category}')",
                    ip_address=client_ip,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Patient has revoked or not granted consent for clinical data sharing with this recipient/category (audited).",
                )

            return patient

        # 4. Hospital Admin Scope: Patient must be linked to admin's hospital
        if role == "hospital_admin":
            admin_hospital = user_scope.get("hospital_id")
            patient_hospitals = patient.get("hospital_ids", [])
            if admin_hospital and admin_hospital not in patient_hospitals:
                await audit_service.log_access_denied_403(
                    user_id=user_id,
                    role=role,
                    permission="hospital:read",
                    resource=resource_path or f"/patients/{patient_id}",
                    scope=user_scope,
                    reason=f"Hospital admin '{user_id}' ({admin_hospital}) accessed patient outside facility",
                    ip_address=client_ip,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Patient is not registered at your hospital facility (audited).",
                )
            return patient

        # 5. System Admin Scope: Allowed
        if role == "system_admin":
            return patient

        # Default Deny for unhandled roles
        await audit_service.log_access_denied_403(
            user_id=user_id,
            role=role,
            permission="records:read",
            resource=resource_path or f"/patients/{patient_id}",
            scope=user_scope,
            reason=f"Role '{role}' is not authorized for patient access",
            ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Unauthorized role for clinical access (audited).",
        )

    async def get_patient_overview(self, patient: Dict[str, Any]) -> Dict[str, Any]:
        """Assembles rich patient overview including hospital details, care teams, and record counters."""
        patient_id = patient["patient_id"]
        hospital_ids = patient.get("hospital_ids", [])

        # Fetch linked hospital details
        hospitals = await organization_repository.get_by_hospital_ids(hospital_ids)

        # Fetch care team memberships
        memberships = await care_team_repository.get_patient_memberships(patient_id)
        care_teams = []
        for m in memberships:
            care_teams.append({
                "care_team_id": m.get("care_team_id"),
                "care_team_name": m.get("care_team_name", m.get("care_team_id")),
                "role": m.get("role", "Care Team Member"),
                "hospital_id": m.get("hospital_id"),
            })

        encounters_count = await encounter_repository.count_patient_encounters(patient_id)

        # Dynamic verified and pending record counts from record_versions
        verified_records_count = await record_version_repository.count_patient_records(
            patient_id, "approved"
        )
        pending_records_count = await record_version_repository.count_patient_records(
            patient_id, "pending_review"
        )
        correction_count = await record_version_repository.count_patient_records(
            patient_id, "requires_correction"
        )
        total_pending = pending_records_count + correction_count

        return {
            "patient_id": patient["patient_id"],
            "mrn": patient["mrn"],
            "name": patient["name"],
            "date_of_birth": patient.get("date_of_birth", "1968-04-12"),
            "gender": patient.get("gender", "Unknown"),
            "blood_type": patient.get("blood_type", "O+"),
            "allergies": patient.get("allergies", []),
            "hospital_ids": hospital_ids,
            "hospitals": [
                {
                    "hospital_id": h["hospital_id"],
                    "name": h["name"],
                    "region": h.get("region", "General"),
                }
                for h in hospitals
            ],
            "care_team_ids": patient.get("care_team_ids", [m.get("care_team_id") for m in memberships]),
            "care_teams": care_teams,
            "active_consent": patient.get("active_consent", True),
            "encounters_count": encounters_count,
            "verified_records_count": verified_records_count,
            "pending_records_count": total_pending,
            "created_at": patient.get("created_at"),
        }

    async def get_patient_access_log(
        self, patient_id: str, user: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Retrieves transparent patient access log including break-glass events,
        standard clinician accesses, consent revocations, and access denials.
        """
        # Validate that caller is authorized to view this patient's logs
        role = user.get("role")
        user_scope = user.get("scope", {})
        if role == "patient" and user_scope.get("patient_id") != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patients may only inspect their own access log.",
            )

        # 1. Fetch raw audit events
        audit_events = await audit_service.get_patient_access_events(patient_id, limit=100)

        # 2. Fetch break-glass sessions
        bg_sessions = await break_glass_repository.list_sessions(patient_id=patient_id, limit=50)

        entries = []
        bg_count = 0

        # Map break glass sessions
        for s in bg_sessions:
            bg_count += 1
            granted_at = s.get("granted_at")
            if isinstance(granted_at, str):
                granted_at = datetime.fromisoformat(granted_at.replace("Z", "+00:00"))

            entries.append({
                "log_id": s.get("session_id"),
                "timestamp": granted_at,
                "accessor_id": s.get("clinician_id"),
                "accessor_name": s.get("clinician_name"),
                "accessor_role": s.get("clinician_role"),
                "access_type": "break_glass_emergency",
                "resource_accessed": "/emergency-summary",
                "purpose": f"Emergency Override: {s.get('reason_category')}",
                "break_glass_justification": s.get("justification"),
                "break_glass_reason_category": s.get("reason_category"),
                "break_glass_session_id": s.get("session_id"),
                "status": s.get("status", "active"),
                "ip_address": s.get("ip_address"),
            })

        # Map audit events
        for ev in audit_events:
            ev_type = ev.get("event_type", "")
            ts = ev.get("timestamp")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

            details = ev.get("details", {})
            acc_type = "standard"
            if "DENIED" in ev.get("status", ""):
                acc_type = "access_denied"
            elif "CONSENT_REVOKED" in ev_type:
                acc_type = "consent_revocation"
            elif "BREAK_GLASS" in ev_type:
                acc_type = "break_glass_emergency"

            entries.append({
                "log_id": str(ev.get("id") or ev.get("_id") or uuid4().hex[:8]),
                "timestamp": ts,
                "accessor_id": ev.get("user_id"),
                "accessor_name": details.get("clinician_name"),
                "accessor_role": ev.get("role"),
                "access_type": acc_type,
                "resource_accessed": details.get("target_resource") or details.get("resource") or ev_type,
                "purpose": details.get("purpose") or details.get("reason"),
                "break_glass_justification": details.get("justification"),
                "break_glass_reason_category": details.get("reason_category"),
                "break_glass_session_id": details.get("session_id"),
                "status": ev.get("status", "SUCCESS"),
                "ip_address": ev.get("ip_address"),
            })

        # Sort combined entries by timestamp descending
        entries.sort(key=lambda x: x["timestamp"], reverse=True)

        return {
            "patient_id": patient_id,
            "total_accesses": len(entries),
            "break_glass_accesses_count": bg_count,
            "entries": entries,
        }


patient_service = PatientService()
