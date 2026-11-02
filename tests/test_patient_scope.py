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
async def test_patient_can_read_self(client: AsyncClient):
    """Eleanor Vance (patient) can read her own overview and timeline."""
    token = await get_token_for(client, "patient.eleanor@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/patients/PAT-SYN-001", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "PAT-SYN-001"
    assert data["mrn"] == "SYN-84920"
    assert data["name"] == "Eleanor Vance"
    assert "HOSP-METRO-01" in data["hospital_ids"]
    assert "HOSP-VALLEY-02" in data["hospital_ids"]
    assert data["encounters_count"] >= 3


@pytest.mark.asyncio
async def test_patient_cannot_read_another_patient_and_is_audited(client: AsyncClient):
    """
    Patient Eleanor Vance attempts to read patient Arthur Pendelton (PAT-SYN-002).
    Must be denied with 403 Forbidden, and the denial must be persisted to audit_events.
    """
    token = await get_token_for(client, "patient.eleanor@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    db = await get_database()
    prior_audit_count = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-PATIENT-001",
    })

    # Attempt cross-patient access
    res = await client.get("/api/v1/patients/PAT-SYN-002", headers=headers)
    assert res.status_code == 403
    err = res.json()
    assert err["error"]["code"] == "FORBIDDEN"
    assert "only access their own health records" in err["error"]["message"].lower()

    # Verify audit event persistence
    new_audit_count = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-PATIENT-001",
    })
    assert new_audit_count == prior_audit_count + 1

    latest_event = await db.audit_events.find_one(
        {"event_type": "ACCESS_DENIED_403", "user_id": "USR-PATIENT-001"},
        sort=[("timestamp", -1)],
    )
    assert latest_event is not None
    assert latest_event["status"] == "DENIED"
    assert "PAT-SYN-002" in latest_event["details"]["reason"]


@pytest.mark.asyncio
async def test_unassigned_doctor_denied_access_and_audited(client: AsyncClient):
    """
    Dr. James Thorne (Neurologist on CT-NEURO-1) is NOT on Eleanor Vance's care team (CT-INTERNAL-B / CT-CARDIO-A).
    Attempting to view Eleanor Vance (PAT-SYN-001) must return 403 Forbidden and log an audit event.
    """
    token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {token}"}

    db = await get_database()
    prior_audit_count = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })

    # Attempt access to unassigned patient
    res = await client.get("/api/v1/patients/PAT-SYN-001", headers=headers)
    assert res.status_code == 403
    err = res.json()
    assert err["error"]["code"] == "FORBIDDEN"
    assert "not assigned to this patient's care team" in err["error"]["message"].lower()

    # Verify audit event
    new_audit_count = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })
    assert new_audit_count == prior_audit_count + 1

    latest_event = await db.audit_events.find_one(
        {"event_type": "ACCESS_DENIED_403", "user_id": "USR-DOC-NEURO-003"},
        sort=[("timestamp", -1)],
    )
    assert latest_event is not None
    assert latest_event["role"] == "doctor"
    assert "not assigned" in latest_event["details"]["reason"].lower()


@pytest.mark.asyncio
async def test_assigned_doctor_and_verifier_granted_access(client: AsyncClient):
    """
    Dr. Marcus Vance (Cardiology Team A) and Dr. Sarah Lin (Internal Medicine Team B)
    are both assigned to Eleanor Vance and can view her overview and timeline.
    """
    # 1. Attending Cardiologist
    cardio_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    res_cardio = await client.get(
        "/api/v1/patients/PAT-SYN-001",
        headers={"Authorization": f"Bearer {cardio_token}"},
    )
    assert res_cardio.status_code == 200
    assert res_cardio.json()["name"] == "Eleanor Vance"

    # 2. Senior Verifier
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    res_verifier = await client.get(
        "/api/v1/patients/PAT-SYN-001",
        headers={"Authorization": f"Bearer {verifier_token}"},
    )
    assert res_verifier.status_code == 200
    assert res_verifier.json()["name"] == "Eleanor Vance"

    # 3. Timeline check
    timeline_res = await client.get(
        "/api/v1/patients/PAT-SYN-001/timeline",
        headers={"Authorization": f"Bearer {verifier_token}"},
    )
    assert timeline_res.status_code == 200
    tl = timeline_res.json()
    assert tl["patient_id"] == "PAT-SYN-001"
    assert tl["total_events"] >= 3
    # Verify encounters across both hospitals are included
    hosp_names = [e["hospital_name"] for e in tl["events"]]
    assert any("Metro Health" in h for h in hosp_names)
    assert any("Valley Memorial" in h for h in hosp_names)


@pytest.mark.asyncio
async def test_scoped_patient_search_prevents_enumeration(client: AsyncClient):
    """
    Verifies that patient search returns only care-team patients for clinicians,
    only self for patients, and empty array when search has no matching accessible records.
    """
    # 1. Eleanor Vance (patient) searches -> returns only herself
    patient_token = await get_token_for(client, "patient.eleanor@synthetic.vericare.internal")
    pat_res = await client.get(
        "/api/v1/patients",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert pat_res.status_code == 200
    pat_list = pat_res.json()
    assert len(pat_list) == 1
    assert pat_list[0]["patient_id"] == "PAT-SYN-001"

    # Eleanor searches for Arthur Pendelton -> returns [] (uniform empty response, no leak)
    pat_search_res = await client.get(
        "/api/v1/patients?query=Arthur",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert pat_search_res.status_code == 200
    assert pat_search_res.json() == []

    # 2. Dr. Marcus Vance (Cardiology Team A) searches -> sees Eleanor Vance, cannot see Arthur
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    doc_res = await client.get(
        "/api/v1/patients",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert doc_res.status_code == 200
    doc_patients = [p["patient_id"] for p in doc_res.json()]
    assert "PAT-SYN-001" in doc_patients
    assert "PAT-SYN-002" not in doc_patients

    # 3. Dr. James Thorne (Neurology Team 1) searches -> sees Arthur Pendelton, cannot see Eleanor
    neuro_token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    neuro_res = await client.get(
        "/api/v1/patients",
        headers={"Authorization": f"Bearer {neuro_token}"},
    )
    assert neuro_res.status_code == 200
    neuro_patients = [p["patient_id"] for p in neuro_res.json()]
    assert "PAT-SYN-002" in neuro_patients
    assert "PAT-SYN-001" not in neuro_patients
