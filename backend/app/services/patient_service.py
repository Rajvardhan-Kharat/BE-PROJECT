from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from backend.app.repositories.care_team_repository import care_team_repository
from backend.app.repositories.encounter_repository import encounter_repository
from backend.app.repositories.organization_repository import organization_repository
from backend.app.repositories.patient_repository import patient_repository
from backend.app.services.audit_service import audit_service


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
    ) -> Dict[str, Any]:
        """
        Verifies whether caller has authorized scope to view or operate on patient_id.
        Enforces:
          1. Patient existence check
          2. Patient consent check
          3. Patient self-only scope check
          4. Doctor care-team membership scope check
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

        # 1. Patient Consent Check
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

        # 3. Doctor & Senior Doctor Scope: Must belong to patient's care team
        if role in ["doctor", "senior_doctor"]:
            clinician_id = user_id
            care_team_id = user_scope.get("care_team_id")
            is_assigned = await care_team_repository.is_clinician_assigned_to_patient(
                patient_id=patient_id,
                clinician_id=clinician_id,
                care_team_id=care_team_id,
            )
            if not is_assigned:
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

        # Verified and pending record counts (currently empty as AI review pipeline builds next)
        verified_records_count = 0
        pending_records_count = 0

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
            "pending_records_count": pending_records_count,
            "created_at": patient.get("created_at"),
        }


patient_service = PatientService()
