import pytest
from httpx import AsyncClient
from backend.app.ai.llm_provider import MockLLMProvider, get_llm_provider, set_llm_provider
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
async def test_verification_assistant_returns_diffs_evidence_and_advisory_suggestion(client: AsyncClient):
    """
    Verification assistant: for a pending submission, returns missing/uncertain fields,
    conflicts with prior records, old vs proposed values, evidence, a short reviewer summary,
    and a suggestion only. Mostly deterministic; LLM rewords summary.
    """
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {verifier_token}"}

    # Analyze pending titration record VER-20261024-002
    res = await client.get("/api/v1/verification/assistant/VER-20261024-002", headers=headers)
    assert res.status_code == 200, f"Assistant call failed: {res.text}"
    data = res.json()

    assert data["version_id"] == "VER-20261024-002"
    assert data["record_id"] == "REC-PAT001-CARDIO-02"
    assert data["patient_id"] == "PAT-SYN-001"

    # Diffs (old vs proposed values)
    assert isinstance(data["old_vs_proposed_values"], list)
    assert len(data["old_vs_proposed_values"]) > 0

    # Evidence items with quotes / notes
    assert isinstance(data["evidence"], list)

    # Suggestion is present and labeled as advisory
    assert data["suggestion"] in ["approve", "reject", "requires_correction"]
    assert "Suggestion only" in data["disclaimer"]

    # Reviewer summary reworded by LLM
    assert len(data["reviewer_summary"]) > 20
    assert "[Aria Verification Synthesis]" in data["reviewer_summary"] or "summary" in data["reviewer_summary"].lower()

    # Agent run ID was assigned and logged
    assert data["agent_run_id"].startswith("RUN-")


@pytest.mark.asyncio
async def test_verification_assistant_llm_outage_fallback(client: AsyncClient):
    """
    When the LLM provider experiences an outage, the verification assistant must NOT crash;
    it safely returns deterministic clinical synthesis.
    """
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {verifier_token}"}

    mock_provider = MockLLMProvider()
    mock_provider.force_down = True
    original_provider = get_llm_provider()
    set_llm_provider(mock_provider)

    try:
        res = await client.get("/api/v1/verification/assistant/VER-20261024-002", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "[Aria Deterministic Summary]" in data["reviewer_summary"]
    finally:
        set_llm_provider(original_provider)


@pytest.mark.asyncio
async def test_emergency_summary_four_sections_and_pending_never_in_verified(client: AsyncClient):
    """
    Emergency summary: assembled from approved records with sections:
    Verified / Pending / Conflicting / Missing-or-stale, source links, last-updated time.
    CRITICAL INVARIANT: Pending items NEVER appear under Verified!
    """
    doctor_token = await get_token_for(client, "dr.marcus@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doctor_token}"}

    res = await client.get("/api/v1/patients/PAT-SYN-001/emergency-summary", headers=headers)
    assert res.status_code == 200, f"Emergency summary failed: {res.text}"
    summary = res.json()

    assert summary["patient_id"] == "PAT-SYN-001"
    assert summary["mrn"] == "SYN-84920"
    assert summary["patient_name"] == "Eleanor Vance"
    assert summary["last_updated_time"] is not None

    # Check 4 sections exist
    assert "verified" in summary
    assert "pending" in summary
    assert "conflicting" in summary
    assert "missing_or_stale" in summary

    # Source links on verified items
    for item in summary["verified"]:
        assert item["source_record_id"]
        assert item["source_version_id"]
        assert item["hospital_name"]
        assert item["reviewed_by"]

    # CRITICAL INVARIANT: Pending items NEVER appear under Verified!
    pending_version_ids = [p["source_version_id"] for p in summary["pending"]]
    assert len(pending_version_ids) > 0, "Expected at least one pending proposal (e.g. VER-20261024-002)"

    verified_version_ids = [v["source_version_id"] for v in summary["verified"]]
    for pid in pending_version_ids:
        assert pid not in verified_version_ids, f"CRITICAL SECURITY FAILURE: Pending proposal {pid} appeared under Verified!"

    # Unverified proposal quarantine warnings
    for p in summary["pending"]:
        assert "UNVERIFIED" in p["quarantine_warning"].upper()


@pytest.mark.asyncio
async def test_empty_allergy_list_shows_unavailable_never_negative(client: AsyncClient):
    """
    CRITICAL CLINICAL LOGIC:
    Missing data is NEVER shown as negative!
    An empty allergy profile must state "Allergy information unavailable"
    and NEVER say "No known allergies" or "NKDA".
    """
    # Arthur Pendelton (PAT-SYN-002) has no documented allergies in seed
    db = await get_database()
    await db.patients.update_one(
        {"patient_id": "PAT-SYN-002"},
        {"$set": {"allergies": []}},
    )

    # Doctor James Thorne (Neurology) is on Arthur's care team
    doc_token = await get_token_for(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    res = await client.get("/api/v1/patients/PAT-SYN-002/emergency-summary", headers=headers)
    assert res.status_code == 200
    summary = res.json()

    # Verified list must NOT contain any allergy claiming 'No allergies'
    verified_text = " ".join([v["label"] + " " + v["details"] for v in summary["verified"]]).lower()
    assert "no known allergies" not in verified_text
    assert "nkda" not in verified_text

    # Missing or Stale section MUST explicitly show "Allergy information unavailable"
    allergy_missing = [
        item for item in summary["missing_or_stale"] if item["category"] == "allergies"
    ]
    assert len(allergy_missing) == 1
    item = allergy_missing[0]
    assert "unavailable" in item["status_display"].lower()
    assert "no known allergies" not in item["status_display"].lower()
    assert "nkda" not in item["status_display"].lower()


@pytest.mark.asyncio
async def test_agent_execution_logs_recorded_and_retrievable(client: AsyncClient):
    """
    Execution log for each agent run (request ID, tools called, input refs, status)
    is persisted and queryable via /agent-runs.
    """
    verifier_token = await get_token_for(client, "dr.sarah@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {verifier_token}"}

    # Trigger verification assistant run
    req_id = "TEST-REQ-VERIFY-001"
    headers_with_req = {**headers, "X-Request-ID": req_id}
    res_assistant = await client.get("/api/v1/verification/assistant/VER-20261024-002", headers=headers_with_req)
    assert res_assistant.status_code == 200

    # Query agent execution logs
    res_logs = await client.get("/api/v1/agent-runs", headers=headers)
    assert res_logs.status_code == 200
    runs = res_logs.json()
    assert len(runs) > 0

    # Locate the run
    matched_runs = [r for r in runs if r["request_id"] == req_id]
    assert len(matched_runs) >= 1
    run = matched_runs[0]

    assert run["agent_name"] == "VerificationAssistantAgent"
    assert run["status"] == "success"
    assert "VER-20261024-002" in run["input_refs"]
    assert len(run["tools_called"]) >= 3
    tool_names = [t["tool_name"] for t in run["tools_called"]]
    assert "fetch_pending_record" in tool_names
    assert "evaluate_extracted_evidence" in tool_names
    assert "compare_prior_records" in tool_names
    assert run["duration_ms"] > 0
