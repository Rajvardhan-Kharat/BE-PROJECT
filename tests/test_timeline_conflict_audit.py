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
async def test_scenario_cross_facility_stale_import_and_all_dates_and_sources_flagged(client: AsyncClient):
    """
    Scenario Test:
    - Hospital A (Metro Health): Medication X (Amlodipine) active Oct 2, 2026.
    - Specialist (Dr. Marcus Vance): Discontinues Oct 8, 2026 due to peripheral edema.
    - Hospital B (Valley Clinic): Imports older medication list Oct 12, 2026 with Medication X active.
    
    INVARIANTS:
    1. Must flag all three dates (2026-10-02, 2026-10-08, 2026-10-12).
    2. Must flag all three sources (Hospital A, Specialist, Hospital B).
    3. Must NOT assume the newest is correct (unresolved by default; warning explicitly highlights stale import).
    4. Clinician resolution is strictly audited.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    # Reset any persisted conflict resolution state for clean scenario run
    db = await get_database()
    await db.timeline_conflicts.delete_many({"patient_id": "PAT-SYN-001"})

    # Fetch Timeline Audit Report
    res = await client.get("/api/v1/patients/PAT-SYN-001/timeline/audit", headers=headers)
    assert res.status_code == 200, f"Failed: {res.text}"
    report = res.json()

    assert report["patient_id"] == "PAT-SYN-001"
    assert report["mrn"] == "SYN-84920"
    assert report["conflicts_count"] >= 1
    assert len(report["timeline"]) >= 3

    # Locate the stale list re-import conflict
    stale_conflicts = [
        c for c in report["conflicts"] if c["rule_id"] == "TL-STALE-IMPORT-001"
    ]
    assert len(stale_conflicts) >= 1, "Expected TL-STALE-IMPORT-001 conflict"
    conflict = stale_conflicts[0]

    # Invariant 1: Must flag all three dates
    dates = conflict["dates"]
    assert len(dates) == 3
    assert "2026-10-02" in dates
    assert "2026-10-08" in dates
    assert "2026-10-12" in dates

    # Invariant 2: Must flag all three sources
    sources_str = " ".join(conflict["sources"]).lower()
    assert "metro" in sources_str or "hospital a" in sources_str
    assert "specialist" in sources_str or "vance" in sources_str
    assert "valley" in sources_str or "hospital b" in sources_str

    # Invariant 3: Must NOT assume newest is correct
    assert conflict["status"] == "unresolved"
    assert "NOT ASSUME NEWEST" in conflict["warning"].upper()
    assert "discontinued" in conflict["explanation"].lower()
    assert "imported" in conflict["explanation"].lower()

    # Verify all three events are preserved in the chronological timeline
    scenario_events = [
        e for e in report["timeline"]
        if "Amlodipine" in e["title"] or "Medication X" in e["title"]
    ]
    assert len(scenario_events) >= 3, "All three conflicting events must be preserved on timeline"

    # All three events have conflict markers attached
    for ev in scenario_events:
        assert ev["has_conflict"] is True
        assert len(ev["conflict_markers"]) >= 1
        marker = ev["conflict_markers"][0]
        assert "Conflict" in marker["label"]
        assert marker["rule_id"] == "TL-STALE-IMPORT-001"

    # Invariant 4: Clinician resolution is strictly audited
    conflict_id = conflict["conflict_id"]

    # Attempt resolve with missing/short reason -> 422
    fail_resolve = await client.post(
        f"/api/v1/timeline/conflicts/{conflict_id}/resolve",
        json={"resolution_action": "confirm_discontinuation", "reason": ""},
        headers=headers,
    )
    assert fail_resolve.status_code == 422

    # Clinician resolves conflict with explicit rationale
    rationale = "Attending Cardiology review: Confirm specialist discontinuation on Oct 8 due to refractory edema. Archive Valley Clinic stale import."
    ok_resolve = await client.post(
        f"/api/v1/timeline/conflicts/{conflict_id}/resolve",
        json={
            "resolution_action": "confirm_discontinuation",
            "reason": rationale,
        },
        headers=headers,
    )
    assert ok_resolve.status_code == 200
    resolved_data = ok_resolve.json()
    assert resolved_data["status"] == "resolved"
    assert resolved_data["resolution"] == "confirm_discontinuation"
    assert resolved_data["resolved_by"] == "USR-DOC-CARDIO-001"
    assert resolved_data["resolved_reason"] == rationale

    # Verify audit event persisted in audit collection
    db = await get_database()
    audit_entry = await db.audit_events.find_one({
        "event_type": "TIMELINE_CONFLICT_RESOLVED",
        "details.conflict_id": conflict_id,
    })
    assert audit_entry is not None
    assert audit_entry["user_id"] == "USR-DOC-CARDIO-001"
    assert audit_entry["role"] == "doctor"
    assert audit_entry["details"]["resolution_action"] == "confirm_discontinuation"
    assert rationale in audit_entry["details"]["rationale"]


@pytest.mark.asyncio
async def test_inconsistent_dates_detected_on_timeline(client: AsyncClient):
    """
    ENC-2026-099 has admission_date (18:30) after discharge_date (14:00).
    Must be detected as TL-DATE-INCONGRUENCE-001 and preserved with marker.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    res = await client.get("/api/v1/patients/PAT-SYN-001/timeline/audit", headers=headers)
    assert res.status_code == 200
    report = res.json()

    date_conflicts = [
        c for c in report["conflicts"] if c["rule_id"] == "TL-DATE-INCONGRUENCE-001"
    ]
    assert len(date_conflicts) >= 1
    dc = date_conflicts[0]
    assert "ENC-2026-099" in dc["entity_key"]
    assert "Inconsistent Encounter Dates" in dc["title"]


@pytest.mark.asyncio
async def test_timeline_filters(client: AsyncClient):
    """
    Tests filtering timeline events by hospital, department, and conflict_only.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    # 1. Filter by hospital
    res_hosp = await client.get(
        "/api/v1/patients/PAT-SYN-001/timeline/audit?hospital_id=HOSP-METRO-01",
        headers=headers,
    )
    assert res_hosp.status_code == 200
    events_hosp = res_hosp.json()["timeline"]
    assert all(e["hospital_id"] == "HOSP-METRO-01" for e in events_hosp)

    # 2. Filter conflicts only
    res_conf = await client.get(
        "/api/v1/patients/PAT-SYN-001/timeline/audit?conflict_only=true",
        headers=headers,
    )
    assert res_conf.status_code == 200
    events_conf = res_conf.json()["timeline"]
    assert len(events_conf) > 0
    assert all(e["has_conflict"] is True for e in events_conf)


@pytest.mark.asyncio
async def test_timeline_audit_patient_scope_and_role_permissions(client: AsyncClient):
    """
    - Patient can read self timeline audit.
    - Unassigned doctor is denied (403).
    - Patient cannot resolve clinical conflicts (403).
    """
    patient_token = await get_token_for(client, "patient.eleanor@synthetic.vericare.internal")
    headers_patient = {"Authorization": f"Bearer {patient_token}"}

    # Patient reads self timeline audit -> 200
    res_patient = await client.get("/api/v1/patients/PAT-SYN-001/timeline/audit", headers=headers_patient)
    assert res_patient.status_code == 200

    # Patient attempts to resolve a conflict -> 403 Forbidden
    res_patient_resolve = await client.post(
        "/api/v1/timeline/conflicts/CONF-ANY/resolve",
        json={"resolution_action": "confirm", "reason": "patient choice"},
        headers=headers_patient,
    )
    assert res_patient_resolve.status_code == 403

    # Unassigned doctor (Dr. Elena Rostova, Oncology - not on Eleanor's care team) -> 403 Forbidden
    unassigned_token = await get_token_for(client, "dr.elena@synthetic.vericare.internal")
    headers_unassigned = {"Authorization": f"Bearer {unassigned_token}"}
    res_unassigned = await client.get("/api/v1/patients/PAT-SYN-001/timeline/audit", headers=headers_unassigned)
    assert res_unassigned.status_code == 403
