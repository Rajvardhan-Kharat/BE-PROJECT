from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient
from backend.app.core.database import get_database

SYNTHETIC_PASSWORD = "synthetic-dev-password"


@pytest.fixture(autouse=True)
async def cleanup_break_glass():
    yield
    db = await get_database()
    await db.break_glass_sessions.delete_many({"clinician_id": "USR-DOC-NEURO-003"})
    await db.patient_consents.delete_many({"patient_id": "PAT-SYN-001"})


async def get_token_for(client: AsyncClient, email: str) -> str:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": SYNTHETIC_PASSWORD},
    )
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_unassigned_doctor_normal_access_denied_with_audit(client: AsyncClient):
    """
    Clinician Dr. James Thorne (USR-DOC-NEURO-003) is not on Eleanor Vance's care team.
    Normal access to her overview must return 403 Forbidden and persist an audit log.
    """
    db = await get_database()
    # Clean any leftover break-glass sessions for this pair to test normal access
    await db.break_glass_sessions.delete_many({
        "patient_id": "PAT-SYN-001",
        "clinician_id": "USR-DOC-NEURO-003",
    })

    token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    prior_audit = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })

    res = await client.get("/api/v1/patients/PAT-SYN-001", headers=headers)
    assert res.status_code == 403
    err = res.json()
    assert "not assigned to this patient's care team" in err["error"]["message"].lower()

    new_audit = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })
    assert new_audit == prior_audit + 1


@pytest.mark.asyncio
async def test_break_glass_missing_or_short_justification_rejected(client: AsyncClient):
    """
    Break-glass request with missing or short (<10 chars) justification must be rejected with 422.
    """
    token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    # Short justification
    res = await client.post(
        "/api/v1/break-glass/request",
        headers=headers,
        json={
            "patient_id": "PAT-SYN-001",
            "justification": "urgent",  # < 10 chars
            "reason_category": "acute_resuscitation",
            "duration_minutes": 60,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_break_glass_activates_limited_view_with_audit_and_notification(client: AsyncClient):
    """
    Non-care-team clinician Dr. James Thorne requests break-glass emergency override.
    - Session created for 60 min
    - High-priority immutable audit event logged
    - In-app notification created for patient
    - Emergency view (Agent 4 summary, allergies, current meds) accessible
    """
    db = await get_database()
    # Reset sessions for rate limit isolation
    await db.break_glass_sessions.delete_many({"clinician_id": "USR-DOC-NEURO-003"})

    token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    prior_bg_audits = await db.audit_events.count_documents({"event_type": "BREAK_GLASS_ACTIVATED"})
    prior_notifs = await db.patient_notifications.count_documents({
        "patient_id": "PAT-SYN-001",
        "type": "BREAK_GLASS_ACCESS",
    })

    # 1. Request Break-Glass
    res = await client.post(
        "/api/v1/break-glass/request",
        headers=headers,
        json={
            "patient_id": "PAT-SYN-001",
            "justification": "Patient collapsed in radiology hallway, unresponsive, acute resuscitation protocol.",
            "reason_category": "acute_resuscitation",
            "duration_minutes": 60,
        },
    )
    assert res.status_code == 200, res.text
    session_data = res.json()
    assert session_data["status"] == "active"
    assert session_data["review_status"] == "pending_review"
    assert session_data["remaining_minutes"] > 0
    assert session_data["access_scope"] == "EMERGENCY_SUMMARY_ONLY"
    session_id = session_data["session_id"]

    # 2. Verify High-Priority Audit Log
    new_bg_audits = await db.audit_events.count_documents({"event_type": "BREAK_GLASS_ACTIVATED"})
    assert new_bg_audits == prior_bg_audits + 1

    audit_entry = await db.audit_events.find_one(
        {"event_type": "BREAK_GLASS_ACTIVATED", "details.session_id": session_id}
    )
    assert audit_entry is not None
    assert audit_entry["priority"] == "HIGH"
    assert audit_entry["severity"] == "CRITICAL"
    assert audit_entry["status"] == "EMERGENCY_OVERRIDE"
    assert audit_entry["details"]["reason_category"] == "acute_resuscitation"

    # 3. Verify In-App Patient Notification
    new_notifs = await db.patient_notifications.count_documents({
        "patient_id": "PAT-SYN-001",
        "type": "BREAK_GLASS_ACCESS",
    })
    assert new_notifs == prior_notifs + 1
    notif = await db.patient_notifications.find_one(
        {"patient_id": "PAT-SYN-001", "type": "BREAK_GLASS_ACCESS"},
        sort=[("created_at", -1)],
    )
    assert notif is not None
    assert "acute_resuscitation" in notif["message"]
    assert notif["priority"] == "HIGH"

    # 4. Access Limited Emergency View
    view_res = await client.get(
        "/api/v1/patients/PAT-SYN-001/break-glass-view",
        headers=headers,
        params={"session_id": session_id},
    )
    assert view_res.status_code == 200, view_res.text
    view_data = view_res.json()
    assert view_data["patient_id"] == "PAT-SYN-001"
    assert "summary" in view_data
    assert "allergies" in view_data
    assert "active_medications" in view_data
    assert "BREAK-GLASS EMERGENCY OVERRIDE" in view_data["disclaimer"]


@pytest.mark.asyncio
async def test_break_glass_scope_limited_blocks_raw_aria_and_private_notes(client: AsyncClient):
    """
    CRITICAL SECURITY INVARIANT:
    Even with an active break-glass emergency session, a clinician is strictly prohibited
    from accessing raw OCR/Aria document dumps or private notes.
    """
    db = await get_database()
    # Reset sessions for rate limit isolation
    await db.break_glass_sessions.delete_many({"clinician_id": "USR-DOC-NEURO-003"})

    token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    # Ensure active break-glass session exists
    res = await client.post(
        "/api/v1/break-glass/request",
        headers=headers,
        json={
            "patient_id": "PAT-SYN-001",
            "justification": "Emergency department trauma intake requiring critical medication history.",
            "reason_category": "trauma_stat",
            "duration_minutes": 60,
        },
    )
    assert res.status_code == 200

    # Attempt to access raw document text via patient scope check
    from backend.app.services.patient_service import patient_service
    fake_clinician_user = {
        "user_id": "USR-DOC-NEURO-003",
        "role": "doctor",
        "scope": {"hospital_id": "HOSP-METRO-01"},
    }

    # Accessing emergency summary is permitted under break-glass
    pat = await patient_service.check_patient_access(
        user=fake_clinician_user,
        patient_id="PAT-SYN-001",
        resource_path="/patients/PAT-SYN-001/emergency-summary",
    )
    assert pat["patient_id"] == "PAT-SYN-001"

    # Accessing raw document text MUST raise 403 Forbidden
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await patient_service.check_patient_access(
            user=fake_clinician_user,
            patient_id="PAT-SYN-001",
            resource_path="/patients/PAT-SYN-001/documents/DOC-SYN-84920-01/raw",
        )
    assert exc_info.value.status_code == 403
    assert "raw aria data" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_break_glass_expiry_enforced(client: AsyncClient):
    """
    Expired break-glass session must be strictly rejected with 403 Forbidden.
    """
    token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    db = await get_database()

    # Create an already expired session in database
    past_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    session_id = f"BG-EXPIRED-TEST-{int(datetime.now().timestamp())}"
    await db.break_glass_sessions.insert_one({
        "session_id": session_id,
        "patient_id": "PAT-SYN-001",
        "clinician_id": "USR-DOC-NEURO-003",
        "clinician_name": "Dr. James Thorne",
        "clinician_role": "doctor",
        "hospital_id": "HOSP-METRO-01",
        "justification": "Past test session for expiry validation",
        "reason_category": "acute_resuscitation",
        "status": "active",
        "review_status": "pending_review",
        "granted_at": past_time - timedelta(minutes=60),
        "expires_at": past_time,
        "access_scope": "EMERGENCY_SUMMARY_ONLY",
    })

    # Attempt to access using expired session
    res = await client.get(
        "/api/v1/patients/PAT-SYN-001/break-glass-view",
        headers=headers,
        params={"session_id": session_id},
    )
    assert res.status_code == 403
    assert "expired" in res.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_break_glass_admin_review_workflow(client: AsyncClient):
    """
    Hospital admin reviews a break-glass override session and marks it as justified or questioned.
    """
    db = await get_database()
    await db.break_glass_sessions.delete_many({"clinician_id": "USR-DOC-NEURO-003"})

    doc_token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    admin_token = await get_token_for(client, "admin.david@synthetic.vericare.internal")

    # 1. Clinician requests session
    bg_res = await client.post(
        "/api/v1/break-glass/request",
        headers={"Authorization": f"Bearer {doc_token}"},
        json={
            "patient_id": "PAT-SYN-001",
            "justification": "Unconscious patient brought by EMS with severe head trauma.",
            "reason_category": "unconscious_patient",
            "duration_minutes": 60,
        },
    )
    assert bg_res.status_code == 200, bg_res.text
    session_id = bg_res.json()["session_id"]

    # 2. Admin reviews as justified
    admin_res = await client.post(
        f"/api/v1/break-glass/admin/{session_id}/review",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "review_status": "justified",
            "review_notes": "Emergency trauma override confirmed with ER triage record.",
        },
    )
    assert admin_res.status_code == 200, admin_res.text
    reviewed = admin_res.json()
    assert reviewed["review_status"] == "justified"
    assert "Emergency trauma override" in reviewed["review_notes"]

    # 3. Verify audit log for admin review
    admin_audit = await db.audit_events.find_one({
        "event_type": "BREAK_GLASS_ADMIN_REVIEWED",
        "details.session_id": session_id,
    })
    assert admin_audit is not None
    assert admin_audit["details"]["outcome"] == "justified"


@pytest.mark.asyncio
async def test_consent_grant_and_revocation_blocks_sharing(client: AsyncClient):
    """
    Patient Eleanor Vance grants consent to Valley Clinic, then revokes it.
    Revocation immediately blocks non-emergency reading by Valley Clinic clinicians.
    """
    patient_token = await get_token_for(client, "patient.eleanor@synthetic.vericare.internal")
    p_headers = {"Authorization": f"Bearer {patient_token}"}

    # 1. Grant consent
    grant_res = await client.post(
        "/api/v1/patients/PAT-SYN-001/consent",
        headers=p_headers,
        json={
            "patient_id": "PAT-SYN-001",
            "purpose": "treatment",
            "categories": ["medications", "allergies"],
            "recipient": "HOSP-VALLEY-02",
            "text_version": "v1.2-synthetic-consent",
        },
    )
    assert grant_res.status_code == 200, grant_res.text
    consent_id = grant_res.json()["consent_id"]
    assert grant_res.json()["status"] == "granted"

    # 2. Revoke consent with mandatory reason
    revoke_res = await client.post(
        f"/api/v1/patients/PAT-SYN-001/consent/{consent_id}/revoke",
        headers=p_headers,
        json={
            "reason": "Patient requested opt-out of cross-hospital data sharing with Valley Clinic.",
        },
    )
    assert revoke_res.status_code == 200, revoke_res.text
    assert revoke_res.json()["status"] == "revoked"
    assert "opt-out" in revoke_res.json()["revocation_reason"]

    # 3. Verify patient notification created
    db = await get_database()
    notif = await db.patient_notifications.find_one({
        "patient_id": "PAT-SYN-001",
        "type": "CONSENT_REVOCATION",
    })
    assert notif is not None
    assert "revoked" in notif["message"].lower()

    # 4. Verify that revoked consent blocks reads for that recipient
    from backend.app.services.patient_service import patient_service
    valley_doctor_user = {
        "user_id": "USR-DOC-VALLEY-099",
        "role": "doctor",
        "scope": {"hospital_id": "HOSP-VALLEY-02", "care_team_id": "CT-VALLEY-01"},
    }

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await patient_service.check_patient_access(
            user=valley_doctor_user,
            patient_id="PAT-SYN-001",
            resource_path="/patients/PAT-SYN-001/overview",
            category="medications",
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_patient_access_log_endpoint(client: AsyncClient):
    """
    Patient requests access log, which transparently lists emergency overrides,
    audit access events, and consent revocations.
    """
    # 1. Create a break-glass event so the patient log reflects it
    doc_token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    await client.post(
        "/api/v1/break-glass/request",
        headers={"Authorization": f"Bearer {doc_token}"},
        json={
            "patient_id": "PAT-SYN-001",
            "justification": "Emergency department trauma intake requiring critical medication history.",
            "reason_category": "trauma_stat",
            "duration_minutes": 60,
        },
    )

    # 2. Patient requests access log
    patient_token = await get_token_for(client, "patient.eleanor@synthetic.vericare.internal")
    p_headers = {"Authorization": f"Bearer {patient_token}"}

    res = await client.get("/api/v1/patients/PAT-SYN-001/access-log", headers=p_headers)
    assert res.status_code == 200, res.text
    log_data = res.json()
    assert log_data["patient_id"] == "PAT-SYN-001"
    assert "entries" in log_data
    assert log_data["total_accesses"] > 0
    assert log_data["break_glass_accesses_count"] >= 1
