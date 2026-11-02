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
async def test_patient_clean_baseline_and_no_invented_severity_scores(client: AsyncClient):
    """
    Test running safety checks on clean seeded patient PAT-SYN-001.
    Verify alert structure strictly conforms: no invented severity scores.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    res = await client.post("/api/v1/patients/PAT-SYN-001/safety/run-checks", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "PAT-SYN-001"
    assert data["rule_set_label"] == "synthetic demonstration rules"
    assert data["rule_set_version"] == "1.0.0"
    assert isinstance(data["alerts"], list)

    # Check alert model constraints: NO invented severity scores
    for alert in data["alerts"]:
        assert "severity" not in alert
        assert "severity_score" not in alert
        assert "risk_level" not in alert
        assert alert["type"] in ["data_inconsistency", "potential_clinical_concern"]
        assert alert["status"] in ["open", "dismissed", "resolved"]
        assert "rule_id" in alert
        assert "source" in alert
        assert "explanation" in alert
        assert "evidence_refs" in alert


@pytest.mark.asyncio
async def test_allergy_contraindication_detected(client: AsyncClient):
    """
    Eleanor Vance has a documented Penicillin allergy.
    Simulating adding an Amoxicillin (or brand Amoxil) prescription triggers ALLERGY-CONTRA-001.
    Type must be 'potential_clinical_concern'.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    custom_rx = [
        {
            "prescription_id": "RX-TEST-ALLERGY-01",
            "drug_name": "Amoxicillin",
            "dosage": "500 mg",
            "frequency": "TID",
            "route": "PO",
            "status": "active",
        }
    ]

    res = await client.post(
        "/api/v1/patients/PAT-SYN-001/safety/run-checks",
        json=custom_rx,
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    allergy_alerts = [a for a in data["alerts"] if a["rule_id"] == "ALLERGY-CONTRA-001"]
    assert len(allergy_alerts) >= 1
    alert = allergy_alerts[0]
    assert alert["type"] == "potential_clinical_concern"
    assert "penicillin" in alert["explanation"].lower()
    assert "amoxicillin" in alert["explanation"].lower()
    assert len(alert["evidence_refs"]) >= 2
    # Verify evidence refs reference both the allergy and prescription
    ref_types = [ref["ref_type"] for ref in alert["evidence_refs"]]
    assert "allergy" in ref_types
    assert "prescription" in ref_types


@pytest.mark.asyncio
async def test_listed_drug_interaction_detected(client: AsyncClient):
    """
    Patient takes Lisinopril (ACE inhibitor).
    Adding Spironolactone or Potassium Chloride triggers listed interaction DDI-SYN-006.
    Testing Warfarin + Aspirin triggers DDI-SYN-001.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    custom_rx = [
        {
            "prescription_id": "RX-TEST-WARFARIN",
            "drug_name": "Warfarin",
            "dosage": "5 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
        },
        {
            "prescription_id": "RX-TEST-ASPIRIN",
            "drug_name": "Aspirin",
            "dosage": "81 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
        },
    ]

    res = await client.post(
        "/api/v1/patients/PAT-SYN-001/safety/run-checks",
        json=custom_rx,
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    ddi_alerts = [a for a in data["alerts"] if a["rule_id"] == "DDI-SYN-001"]
    assert len(ddi_alerts) == 1
    alert = ddi_alerts[0]
    assert alert["type"] == "potential_clinical_concern"
    assert "hemorrhage" in alert["explanation"].lower() or "anticoagulant" in alert["explanation"].lower()
    assert len(alert["evidence_refs"]) == 2


@pytest.mark.asyncio
async def test_duplicate_active_prescription_detected(client: AsyncClient):
    """
    Patient has existing Lisinopril 10mg daily.
    Adding another active prescription for Zestril (brand alias for lisinopril)
    triggers DUP-RX-001.
    Type must be 'data_inconsistency'.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    custom_rx = [
        {
            "prescription_id": "RX-TEST-ZESTRIL-DUP",
            "drug_name": "Zestril",
            "dosage": "20 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
        }
    ]

    res = await client.post(
        "/api/v1/patients/PAT-SYN-001/safety/run-checks",
        json=custom_rx,
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    dup_alerts = [a for a in data["alerts"] if a["rule_id"] == "DUP-RX-001"]
    assert len(dup_alerts) >= 1
    alert = dup_alerts[0]
    assert alert["type"] == "data_inconsistency"
    assert "lisinopril" in alert["explanation"].lower()


@pytest.mark.asyncio
async def test_contradictory_status_across_encounters(client: AsyncClient):
    """
    Same medication recorded as both 'active' and 'discontinued'
    triggers STATUS-CONFLICT-001.
    Type must be 'data_inconsistency'.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    custom_rx = [
        {
            "prescription_id": "RX-TEST-ACTIVE",
            "drug_name": "Furosemide",
            "dosage": "20 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
            "encounter_id": "ENC-001",
        },
        {
            "prescription_id": "RX-TEST-DISCONTINUED",
            "drug_name": "Lasix",
            "dosage": "20 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "discontinued",
            "encounter_id": "ENC-002",
        },
    ]

    res = await client.post(
        "/api/v1/patients/PAT-SYN-001/safety/run-checks",
        json=custom_rx,
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    status_conflicts = [a for a in data["alerts"] if a["rule_id"] == "STATUS-CONFLICT-001"]
    assert len(status_conflicts) >= 1
    furo_alert = next((a for a in status_conflicts if "furosemide" in a["explanation"].lower()), None)
    assert furo_alert is not None
    assert furo_alert["type"] == "data_inconsistency"
    assert "furosemide" in furo_alert["explanation"].lower()


@pytest.mark.asyncio
async def test_dosage_and_duration_inconsistency_detected(client: AsyncClient):
    """
    Prescriptions exceeding daily limits or usual duration limits:
    - Lisinopril 120 mg daily (max single/daily ~80mg)
    - Amoxicillin duration 90 days (max acute duration 28 days)
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    custom_rx = [
        {
            "prescription_id": "RX-TEST-HIGH-DOSE",
            "drug_name": "Lisinopril",
            "dosage": "120 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
        },
        {
            "prescription_id": "RX-TEST-LONG-DURATION",
            "drug_name": "Ketorolac",
            "dosage": "10 mg",
            "frequency": "daily",
            "duration_days": 10,
            "route": "PO",
            "status": "active",
        },
    ]

    res = await client.post(
        "/api/v1/patients/PAT-SYN-001/safety/run-checks",
        json=custom_rx,
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    dose_alerts = [a for a in data["alerts"] if a["rule_id"] == "DOSE-EXCEEDED-002"]
    assert len(dose_alerts) >= 1
    assert dose_alerts[0]["type"] == "potential_clinical_concern"

    duration_alerts = [a for a in data["alerts"] if a["rule_id"] == "DURATION-INCONSISTENCY-001"]
    assert len(duration_alerts) >= 1
    assert duration_alerts[0]["type"] == "data_inconsistency"


@pytest.mark.asyncio
async def test_dismiss_and_resolve_alert_requires_reason(client: AsyncClient):
    """
    Dismissing and resolving alerts requires a mandatory clinical reason.
    Submitting without or with empty reason must be rejected with 422.
    """
    doc_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    # Generate an alert
    custom_rx = [
        {
            "prescription_id": "RX-DISMISS-TEST",
            "drug_name": "Warfarin",
            "dosage": "5 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
        },
        {
            "prescription_id": "RX-DISMISS-TEST-2",
            "drug_name": "Aspirin",
            "dosage": "81 mg",
            "frequency": "daily",
            "route": "PO",
            "status": "active",
        },
    ]
    check_res = await client.post(
        "/api/v1/patients/PAT-SYN-001/safety/run-checks",
        json=custom_rx,
        headers=headers,
    )
    assert check_res.status_code == 200
    alerts = check_res.json()["alerts"]
    assert len(alerts) > 0
    target_alert = alerts[0]
    alert_id = target_alert["alert_id"]

    # Attempt dismiss without reason -> 422
    fail_dismiss = await client.post(
        f"/api/v1/safety/alerts/{alert_id}/dismiss",
        json={"reason": ""},
        headers=headers,
    )
    assert fail_dismiss.status_code == 422

    # Dismiss with valid reason -> 200
    ok_dismiss = await client.post(
        f"/api/v1/safety/alerts/{alert_id}/dismiss",
        json={"reason": "Cardiology reviewed: Co-prescribed under strict INR monitoring for mechanical valve."},
        headers=headers,
    )
    assert ok_dismiss.status_code == 200
    dismissed_data = ok_dismiss.json()
    assert dismissed_data["status"] == "dismissed"
    assert dismissed_data["dismissed_by"] == "USR-DOC-CARDIO-001"
    assert "strict INR monitoring" in dismissed_data["dismissed_reason"]

    # Attempt resolve without reason -> 422
    fail_resolve = await client.post(
        f"/api/v1/safety/alerts/{alert_id}/resolve",
        json={"reason": "ab"},  # min_length 3
        headers=headers,
    )
    assert fail_resolve.status_code == 422

    # Resolve with valid reason -> 200
    ok_resolve = await client.post(
        f"/api/v1/safety/alerts/{alert_id}/resolve",
        json={"reason": "Aspirin discontinued after clinical re-evaluation; single agent warfarin maintained."},
        headers=headers,
    )
    assert ok_resolve.status_code == 200
    resolved_data = ok_resolve.json()
    assert resolved_data["status"] == "resolved"
    assert resolved_data["resolved_by"] == "USR-DOC-CARDIO-001"
    assert "Aspirin discontinued" in resolved_data["resolved_reason"]


@pytest.mark.asyncio
async def test_unassigned_doctor_denied_access_to_safety_checks_and_alerts(client: AsyncClient):
    """
    Doctor Dr. Elena Rostova (Oncology) is NOT in Eleanor Vance's care team.
    Attempting to view or run checks for Eleanor Vance must return 403 Forbidden.
    """
    unassigned_doc_token = await get_token_for(client, "dr.elena@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {unassigned_doc_token}"}

    # Attempt running safety checks
    res_run = await client.post("/api/v1/patients/PAT-SYN-001/safety/run-checks", headers=headers)
    assert res_run.status_code == 403

    # Attempt listing alerts
    res_list = await client.get("/api/v1/patients/PAT-SYN-001/safety/alerts", headers=headers)
    assert res_list.status_code == 403
