import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.database import get_database


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


async def login(client: AsyncClient, email: str, role: str = "") -> str:
    res = await client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": "synthetic-dev-password",
        },
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_followup_status_and_no_adherence_inference(client: AsyncClient):
    """
    14a Follow-ups:
    - Lists follow-ups and medication courses for authorized patient.
    - Confirms upcoming, overdue, and completed statuses exist.
    - MANDATORY: Adherence is never inferred (adherence_inferred is False).
    - Unassigned doctor (Dr. James Thorne) is denied (403 + audit).
    """
    # 1. Authorized doctor on care team: Dr. Marcus Vance (Cardiology)
    token_cardio = await login(client, "dr.marcus@synthetic.vericare.internal", "doctor")
    headers_cardio = {"Authorization": f"Bearer {token_cardio}"}

    res = await client.get("/api/v1/followups/patient/PAT-SYN-001", headers=headers_cardio)
    assert res.status_code == 200
    followups = res.json()
    assert len(followups) >= 3

    statuses = {f["status"] for f in followups}
    assert "upcoming" in statuses
    assert "overdue" in statuses or "completed" in statuses

    # MANDATORY: Every item has adherence_inferred = False
    for item in followups:
        assert item["adherence_inferred"] is False
        assert "Adherence is never inferred" in item["clinical_safety_note"]
        assert "status" in item
        assert "days_overdue_or_remaining" in item

    # 2. Unassigned doctor: Dr. James Thorne (Neurology) - NOT in Eleanor's care team
    token_unassigned = await login(client, "dr.james@synthetic.vericare.internal", "doctor")
    headers_unassigned = {"Authorization": f"Bearer {token_unassigned}"}

    denied_res = await client.get("/api/v1/followups/patient/PAT-SYN-001", headers=headers_unassigned)
    assert denied_res.status_code == 403

    db = await get_database()
    audit_event = await db.audit_events.find_one({
        "event_type": "ACCESS_DENIED_403",
        "user_id": "USR-DOC-NEURO-003",
    })
    assert audit_event is not None


@pytest.mark.asyncio
async def test_followup_agent_deterministic_evaluation(client: AsyncClient):
    """
    Tests Agent 5 evaluation endpoint: computes schedule timeline without inferring adherence.
    """
    token_verifier = await login(client, "dr.sarah@synthetic.vericare.internal", "senior_doctor")
    headers = {"Authorization": f"Bearer {token_verifier}"}

    eval_res = await client.post("/api/v1/followups/patient/PAT-SYN-001/evaluate", headers=headers)
    assert eval_res.status_code == 200
    data = eval_res.json()

    assert data["patient_id"] == "PAT-SYN-001"
    assert data["adherence_inferred"] is False
    assert data["total_tracked"] >= 3
    assert "Adherence is never inferred" in data["summary"]


@pytest.mark.asyncio
async def test_followup_status_transition_with_mandatory_rationale(client: AsyncClient):
    """
    Tests status transition on follow-ups (defer with new due date, complete) requiring reason.
    """
    token_cardio = await login(client, "dr.marcus@synthetic.vericare.internal", "doctor")
    headers = {"Authorization": f"Bearer {token_cardio}"}

    # 1. Update status to deferred requires new_due_date
    bad_defer = await client.patch(
        "/api/v1/followups/FOL-SYN-001/status",
        headers=headers,
        json={
            "status": "deferred",
            "reason": "Patient requested postponement",
        },
    )
    assert bad_defer.status_code == 400

    # 2. Valid deferral with new due date
    valid_defer = await client.patch(
        "/api/v1/followups/FOL-SYN-001/status",
        headers=headers,
        json={
            "status": "deferred",
            "reason": "Patient traveling out of state; postponed outpatient visit.",
            "new_due_date": "2026-12-05",
        },
    )
    assert valid_defer.status_code == 200
    updated = valid_defer.json()
    assert updated["status"] == "deferred"
    assert updated["due_date"] == "2026-12-05"
    assert len(updated["audit_history"]) >= 2


@pytest.mark.asyncio
async def test_second_memory_private_note_hidden_from_other_care_team_doctor(client: AsyncClient):
    """
    14b Second Memory Security Boundary:
    - Dr. Marcus Vance creates a private note (is_private=True).
    - Dr. Marcus Vance can read it.
    - Dr. Sarah Lin (on same care team for same patient) is DENIED (403 + audit).
    - Dr. Sarah Lin's search endpoint omits Dr. Vance's private note.
    """
    token_vance = await login(client, "dr.marcus@synthetic.vericare.internal", "doctor")
    headers_vance = {"Authorization": f"Bearer {token_vance}"}

    token_lin = await login(client, "dr.sarah@synthetic.vericare.internal", "senior_doctor")
    headers_lin = {"Authorization": f"Bearer {token_lin}"}

    # 1. Dr. Vance creates a private scratchpad note
    create_res = await client.post(
        "/api/v1/collaboration/notes",
        headers=headers_vance,
        json={
            "patient_id": "PAT-SYN-001",
            "title": "Private Clinician Note: Suspected Borderline Renal Impairment",
            "content": "Confidential clinician impression: Serum creatinine trend suggests early ACEI intolerance. Keep under observation.",
            "is_private": True,
            "tags": ["Private", "Cardiology", "Renal"],
            "citations": [],
        },
    )
    assert create_res.status_code == 201
    private_note = create_res.json()
    note_id = private_note["note_id"]
    assert private_note["is_private"] is True

    # 2. Dr. Vance can read his own private note
    vance_read = await client.get(f"/api/v1/collaboration/notes/{note_id}", headers=headers_vance)
    assert vance_read.status_code == 200
    assert vance_read.json()["note_id"] == note_id

    # 3. Dr. Sarah Lin attempts to read Dr. Vance's private note -> 403 FORBIDDEN
    lin_read = await client.get(f"/api/v1/collaboration/notes/{note_id}", headers=headers_lin)
    assert lin_read.status_code == 403

    # Audit log check
    db = await get_database()
    audit_ev = await db.audit_events.find_one({
        "event_type": "COLLABORATION_PRIVATE_NOTE_DENIED",
        "user_id": "USR-VERIFIER-001",
    })
    assert audit_ev is not None
    assert audit_ev["details"]["patient_id"] == "PAT-SYN-001"

    # 4. Dr. Sarah Lin searches notes -> private note must NOT be in the results
    search_res = await client.get(
        "/api/v1/collaboration/notes/patient/PAT-SYN-001",
        headers=headers_lin,
    )
    assert search_res.status_code == 200
    lin_notes = search_res.json()
    note_ids = [n["note_id"] for n in lin_notes]
    assert note_id not in note_ids


@pytest.mark.asyncio
async def test_second_memory_search_and_cited_summary(client: AsyncClient):
    """
    Tests authorized search/filters over notes and cited summary synthesis.
    """
    token_vance = await login(client, "dr.marcus@synthetic.vericare.internal", "doctor")
    headers = {"Authorization": f"Bearer {token_vance}"}

    # 1. Filter by tag
    tag_res = await client.get(
        "/api/v1/collaboration/notes/patient/PAT-SYN-001?tag=Cardiology",
        headers=headers,
    )
    assert tag_res.status_code == 200
    assert len(tag_res.json()) >= 1

    # 2. Keyword query
    q_res = await client.get(
        "/api/v1/collaboration/notes/patient/PAT-SYN-001?q=Titration",
        headers=headers,
    )
    assert q_res.status_code == 200
    assert len(q_res.json()) >= 1

    # 3. Cited Summary Generation
    summary_res = await client.post(
        "/api/v1/collaboration/notes/patient/PAT-SYN-001/cited-summary",
        headers=headers,
        json={
            "date_from": "2026-10-01",
            "date_to": "2026-11-05",
            "topic": "Titration",
        },
    )
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert summary_data["total_notes_analyzed"] >= 1
    assert len(summary_data["cited_records"]) >= 1
    assert "Second Memory" in summary_data["summary_text"]


@pytest.mark.asyncio
async def test_care_team_tasks_and_in_app_notifications(client: AsyncClient):
    """
    Tests clinical tasks creation, assignment, and corresponding in-app notification.
    """
    token_vance = await login(client, "dr.marcus@synthetic.vericare.internal", "doctor")
    headers_vance = {"Authorization": f"Bearer {token_vance}"}

    token_lin = await login(client, "dr.sarah@synthetic.vericare.internal", "senior_doctor")
    headers_lin = {"Authorization": f"Bearer {token_lin}"}

    # 1. Dr. Vance creates a task assigned to Dr. Sarah Lin
    task_res = await client.post(
        "/api/v1/collaboration/tasks",
        headers=headers_vance,
        json={
            "patient_id": "PAT-SYN-001",
            "title": "Check Ambulatory ECG Report",
            "description": "Assess 24-hr Holter monitor results for paroxysmal AFib burden.",
            "assigned_to": "USR-VERIFIER-001",
            "priority": "high",
            "due_date": "2026-11-18",
        },
    )
    assert task_res.status_code == 201
    task_data = task_res.json()
    assert task_data["status"] == "pending"

    # 2. Dr. Sarah Lin checks notifications -> receives task_assigned notification
    notif_res = await client.get("/api/v1/notifications", headers=headers_lin)
    assert notif_res.status_code == 200
    notif_data = notif_res.json()
    assert notif_data["unread_count"] >= 1

    matching = [
        n for n in notif_data["notifications"]
        if n["type"] == "task_assigned" and "Ambulatory ECG" in n["title"]
    ]
    assert len(matching) >= 1
    notif_id = matching[0]["notification_id"]

    # 3. Mark notification as read
    read_res = await client.patch(f"/api/v1/notifications/{notif_id}/read", headers=headers_lin)
    assert read_res.status_code == 200


@pytest.mark.asyncio
async def test_specialist_query_lifecycle(client: AsyncClient):
    """
    Tests question between specialists: asking, notification, reply, and status update.
    """
    token_vance = await login(client, "dr.marcus@synthetic.vericare.internal", "doctor")
    headers_vance = {"Authorization": f"Bearer {token_vance}"}

    token_lin = await login(client, "dr.sarah@synthetic.vericare.internal", "senior_doctor")
    headers_lin = {"Authorization": f"Bearer {token_lin}"}

    # 1. Dr. Vance asks Dr. Lin a specialist question
    query_res = await client.post(
        "/api/v1/collaboration/queries",
        headers=headers_vance,
        json={
            "patient_id": "PAT-SYN-001",
            "to_doctor_id": "USR-VERIFIER-001",
            "to_specialty": "Internal Medicine",
            "subject": "Diuretic titration with mild hypokalemia",
            "question": "Sarah, Eleanor's potassium is 3.6 mEq/L. Should we add spironolactone or oral potassium chloride?",
            "priority": "routine",
        },
    )
    assert query_res.status_code == 201
    q_data = query_res.json()
    query_id = q_data["query_id"]
    assert q_data["status"] == "open"

    # 2. Dr. Lin replies to the question
    reply_res = await client.post(
        f"/api/v1/collaboration/queries/{query_id}/reply",
        headers=headers_lin,
        json={
            "answer": "Recommend oral KCl 20 mEq daily with re-check in 5 days before initiating spironolactone.",
        },
    )
    assert reply_res.status_code == 200
    replied_data = reply_res.json()
    assert replied_data["status"] == "answered"
    assert len(replied_data["responses"]) == 1
    assert "oral KCl" in replied_data["responses"][0]["answer"]


@pytest.mark.asyncio
async def test_correction_metrics_dashboard(client: AsyncClient):
    """
    14c Correction Dashboard:
    - Verifies aggregate human corrections metrics.
    - MANDATORY: Response contains 'synthetic_benchmark_notice == "measured on synthetic data"'.
    - Checks overall correction rate, accepted unchanged share, field type breakdown, avg review duration.
    """
    token_admin = await login(client, "admin.david@synthetic.vericare.internal", "hospital_admin")
    headers = {"Authorization": f"Bearer {token_admin}"}

    res = await client.get("/api/v1/metrics/corrections", headers=headers)
    assert res.status_code == 200
    metrics = res.json()

    # MANDATORY LABEL
    assert metrics["synthetic_benchmark_notice"] == "measured on synthetic data"

    # Calculations
    assert metrics["total_documents_reviewed"] > 0
    assert metrics["total_fields_reviewed"] > 0
    assert 0.0 <= metrics["overall_correction_rate"] <= 100.0
    assert 0.0 <= metrics["accepted_unchanged_share"] <= 100.0
    assert round(metrics["overall_correction_rate"] + metrics["accepted_unchanged_share"], 0) == 100.0
    assert metrics["avg_review_time_seconds"] > 0.0

    # Field-type breakdown
    assert len(metrics["by_field_type"]) >= 5
    field_names = [f["field_type"] for f in metrics["by_field_type"]]
    assert "medication" in field_names
    assert "dosage" in field_names
    assert "allergy" in field_names

    for f_metric in metrics["by_field_type"]:
        assert 0.0 <= f_metric["correction_rate"] <= 100.0
