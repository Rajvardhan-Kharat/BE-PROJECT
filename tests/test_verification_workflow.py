import pytest
from httpx import AsyncClient
from backend.app.core.database import get_database

SYNTHETIC_PASSWORD = "synthetic-dev-password"


async def get_token_for(client: AsyncClient, email: str) -> str:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": SYNTHETIC_PASSWORD},
    )
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_submit_for_verification_and_appears_in_queue(client: AsyncClient):
    """
    Doctor submits a new proposal for patient Eleanor Vance.
    Record is stored in record_versions with status 'pending_review' and appears in queue.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    submit_payload = {
        "patient_id": "PAT-SYN-001",
        "record_type": "clinical_note",
        "title": "Cardiology Post-Procedure Progress Note",
        "department": "Cardiology",
        "hospital_id": "HOSP-METRO-01",
        "data": {
            "rhythm": "Normal sinus rhythm",
            "heart_rate": "72 bpm",
            "ambulatory_status": "Independent",
        },
        "clinical_timestamp": "2026-10-30T10:00:00Z",
    }

    res = await client.post("/api/v1/verification/submit", json=submit_payload, headers=headers)
    assert res.status_code == 200
    created = res.json()
    assert created["status"] == "pending_review"
    assert created["version_number"] == 1
    assert created["department"] == "Cardiology"
    assert created["submitted_by"] == "USR-DOC-CARDIO-001"

    # Verifier fetches queue
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    queue_res = await client.get("/api/v1/verification/queue", headers={"Authorization": f"Bearer {verifier_token}"})
    assert queue_res.status_code == 200
    queue = queue_res.json()
    assert any(q["version_id"] == created["version_id"] for q in queue)


@pytest.mark.asyncio
async def test_non_verifier_denied(client: AsyncClient):
    """
    TEST: non-verifier denied.
    A regular clinician (dr.james or dr.marcus) without senior_doctor verifier role
    attempts to approve a record. Must be denied with 403 Forbidden and audited.
    """
    doc_token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    db = await get_database()
    prior_audit = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })

    # Attempt to approve pending record
    decision_payload = {
        "decision": "approved",
        "reason": "Doctor trying to approve",
    }

    res = await client.post(
        "/api/v1/verification/VER-20261024-002/decide",
        json=decision_payload,
        headers=headers,
    )
    assert res.status_code == 403
    err = res.json()
    assert err["error"]["code"] == "FORBIDDEN"

    # Verify audit trail recorded 403
    new_audit = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })
    assert new_audit > prior_audit


@pytest.mark.asyncio
async def test_self_approval_denied(client: AsyncClient):
    """
    TEST: self-approval denied.
    Dr. Marcus Vance (USR-DOC-CARDIO-001) submitted VER-20261024-002.
    If Dr. Marcus Vance attempts to approve his own submission, must be denied with 403.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    res = await client.post(
        "/api/v1/verification/VER-20261024-002/decide",
        json={"decision": "approved", "reason": "Self approving my own order"},
        headers=headers,
    )
    assert res.status_code == 403
    err = res.json()
    assert err["error"]["code"] == "FORBIDDEN"
    assert "cannot approve" in err["error"]["message"].lower() or "self" in err["error"]["message"].lower()


@pytest.mark.asyncio
async def test_reason_required_on_reject_and_correction(client: AsyncClient):
    """
    TEST: reason required.
    Reject or request_correction without a detailed clinical reason returns 422 Unprocessable Entity.
    """
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {verifier_token}"}

    # 1. Reject without reason
    res_reject_empty = await client.post(
        "/api/v1/verification/VER-20261024-002/decide",
        json={"decision": "rejected", "reason": "  "},
        headers=headers,
    )
    assert res_reject_empty.status_code == 422
    assert "mandatory" in res_reject_empty.json()["error"]["message"].lower()

    # 2. Correction without reason
    res_corr_empty = await client.post(
        "/api/v1/verification/VER-20261024-002/decide",
        json={"decision": "requires_correction", "reason": ""},
        headers=headers,
    )
    assert res_corr_empty.status_code == 422
    assert "mandatory" in res_corr_empty.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_version_history_preserved_on_approval(client: AsyncClient):
    """
    TEST: version history preserved.
    Approving creates a new approved version (e.g. v2) and marks older versions superseded.
    Old records are never destroyed or overwritten; full version history is maintained.
    """
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {verifier_token}"}

    # Dr. Sarah Lin approves pending record VER-20261024-002 (REC-PAT001-CARDIO-02)
    approve_payload = {
        "decision": "approved",
        "reason": "Titration verified per ambulatory vital observations.",
        "human_modifications": {
            "verifier_note": "Verified by Dr. Sarah Lin",
        },
    }

    res = await client.post(
        "/api/v1/verification/VER-20261024-002/decide",
        json=approve_payload,
        headers=headers,
    )
    assert res.status_code == 200
    new_approved = res.json()
    assert new_approved["status"] == "approved"
    assert new_approved["version_number"] >= 2
    assert new_approved["record_id"] == "REC-PAT001-CARDIO-02"
    assert new_approved["reviewed_by"] == "USR-VERIFIER-001"
    assert new_approved["data"]["verifier_note"] == "Verified by Dr. Sarah Lin"

    # Check database: previous version VER-20261024-002 must still exist and be marked superseded
    db = await get_database()
    old_version = await db.record_versions.find_one({"version_id": "VER-20261024-002"})
    assert old_version is not None
    assert old_version["status"] == "superseded"
    assert old_version["superseded_by"] == new_approved["version_id"]

    # History endpoint returns both versions in chronological order
    history_res = await client.get(
        f"/api/v1/verification/records/{new_approved['record_id']}/history",
        headers=headers,
    )
    assert history_res.status_code == 200
    hist = history_res.json()
    assert hist["total_versions"] >= 2
    version_numbers = [v["version_number"] for v in hist["versions"]]
    assert version_numbers == sorted(version_numbers)


@pytest.mark.asyncio
async def test_old_import_never_overwrites_newer_reviewed_record(client: AsyncClient):
    """
    TEST: old import never overwrites a newer reviewed record.
    An attempt to submit an older import for an already approved record is rejected with 409 Conflict.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    # REC-PAT001-CARDIO-01 is approved with timestamp 2026-10-18 14:00
    # Attempt to submit an older import dated 2026-10-10
    stale_payload = {
        "patient_id": "PAT-SYN-001",
        "record_id": "REC-PAT001-CARDIO-01",
        "record_type": "discharge_summary",
        "title": "Legacy OCR Ingestion for Cardiology",
        "department": "Cardiology",
        "hospital_id": "HOSP-METRO-01",
        "data": {
            "primary_diagnosis": "Old AFib extraction",
        },
        "clinical_timestamp": "2026-10-10T08:00:00Z",
    }

    res = await client.post("/api/v1/verification/submit", json=stale_payload, headers=headers)
    assert res.status_code == 409
    err = res.json()
    assert err["error"]["code"] == "CONFLICT"
    assert "older than active reviewed record" in err["error"]["message"].lower()


@pytest.mark.asyncio
async def test_approved_data_appears_in_timeline_and_pending_in_separate_section(client: AsyncClient):
    """
    TEST: Approved data appears in trusted timeline; pending data in separate section.
    """
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {verifier_token}"}

    # 1. Timeline check
    timeline_res = await client.get("/api/v1/patients/PAT-SYN-001/timeline", headers=headers)
    assert timeline_res.status_code == 200
    timeline = timeline_res.json()

    # Timeline must contain approved record events
    approved_events = [e for e in timeline["events"] if e["status"] == "approved"]
    assert len(approved_events) > 0
    # Timeline must NOT contain pending_review or requires_correction events
    assert not any(e["status"] in ["pending_review", "requires_correction"] for e in timeline["events"])

    # 2. Pending records separate endpoint
    pending_res = await client.get("/api/v1/patients/PAT-SYN-001/pending-records", headers=headers)
    assert pending_res.status_code == 200
    pending_records = pending_res.json()
    assert all(r["status"] in ["pending_review", "requires_correction"] for r in pending_records)
