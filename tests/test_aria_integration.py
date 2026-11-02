import json
import logging
import pytest
import httpx
from datetime import datetime, timezone
from httpx import AsyncClient, MockTransport, Response

from backend.app.core.database import get_database
from backend.app.integrations.aria.base import (
    AriaSendMessageRequest,
    AriaDraftSummaryRequest,
)
from backend.app.integrations.aria.http_provider import HttpAriaProvider
from backend.app.integrations.aria.safety.crisis_detector import (
    CrisisSafetyDetector,
    crisis_detector,
)

SYNTHETIC_PASSWORD = "synthetic-dev-password"


async def get_token(client: AsyncClient, email: str) -> str:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": SYNTHETIC_PASSWORD},
    )
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_access_boundaries_non_patients_denied(client: AsyncClient):
    """
    Doctor, Verifier, and Hospital Admin cannot read Aria sessions or send Aria messages.
    Must receive 403 Forbidden, and each denial is persisted to audit_events.
    """
    db = await get_database()

    # 1. Doctor attempt
    doc_token = await get_token(client, "dr.marcus@synthetic.vericare.internal")
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    res_doc_get = await client.get("/api/v1/aria/sessions", headers=doc_headers)
    assert res_doc_get.status_code == 403, f"Expected 403 for doctor, got {res_doc_get.status_code}"

    res_doc_post = await client.post(
        "/api/v1/aria/sessions",
        json={"title": "Unauthorized Doctor Session"},
        headers=doc_headers,
    )
    assert res_doc_post.status_code == 403

    # 2. Senior Verifier attempt
    verifier_token = await get_token(client, "dr.sarah@synthetic.vericare.internal")
    verifier_headers = {"Authorization": f"Bearer {verifier_token}"}

    res_ver_get = await client.get("/api/v1/aria/sessions", headers=verifier_headers)
    assert res_ver_get.status_code == 403

    # 3. Hospital Admin attempt
    admin_token = await get_token(client, "admin.david@synthetic.vericare.internal")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    res_admin_get = await client.get("/api/v1/aria/sessions", headers=admin_headers)
    assert res_admin_get.status_code == 403

    # Verify audit event recorded for unauthorized role access
    audit_record = await db.audit_events.find_one(
        {"event_type": "ACCESS_DENIED_403", "user_id": "USR-DOC-CARDIO-001"},
        sort=[("timestamp", -1)],
    )
    assert audit_record is not None
    assert "/aria" in audit_record.get("details", {}).get("target_resource", "")


@pytest.mark.asyncio
async def test_break_glass_never_exposes_aria_data(client: AsyncClient):
    """
    Emergency break-glass views must NEVER include private Aria companion data,
    sessions, or messages. Only verified clinical summaries and approved medications are exposed.
    """
    # Create emergency break-glass session as non-care-team Dr. James
    doc_token = await get_token(client, "dr.james@synthetic.vericare.internal")
    headers = {"Authorization": f"Bearer {doc_token}"}

    bg_res = await client.post(
        "/api/v1/break-glass/request",
        json={
            "patient_id": "PAT-SYN-001",
            "justification": "Emergency department trauma intake requiring critical medication history.",
            "reason_category": "trauma_stat",
            "duration_minutes": 60,
        },
        headers=headers,
    )
    assert bg_res.status_code == 200

    # Access break-glass view
    view_res = await client.get("/api/v1/patients/PAT-SYN-001/break-glass-view", headers=headers)
    assert view_res.status_code == 200
    data_str = json.dumps(view_res.json()).lower()

    # Invariant: zero references to Aria collections or companion chats
    assert "aria_messages" not in data_str
    assert "aria_sessions" not in data_str
    assert "private reflections" not in data_str
    assert "companion journal" not in data_str


@pytest.mark.asyncio
async def test_patient_session_lifecycle_and_cross_patient_isolation(client: AsyncClient):
    """
    Patient Eleanor can create and read her sessions.
    Patient Arthur (PAT-SYN-002) is strictly forbidden from reading Eleanor's session.
    """
    eleanor_token = await get_token(client, "patient.eleanor@synthetic.vericare.internal")
    eleanor_headers = {"Authorization": f"Bearer {eleanor_token}"}

    # 1. Eleanor acknowledges notice
    ack_res = await client.post(
        "/api/v1/aria/notice/ack",
        json={"version": "2026.11-v1"},
        headers=eleanor_headers,
    )
    assert ack_res.status_code in [200, 201]

    # 2. Eleanor creates session
    sess_res = await client.post(
        "/api/v1/aria/sessions",
        json={"title": "Private Wellness Journal"},
        headers=eleanor_headers,
    )
    assert sess_res.status_code == 201
    session_ref = sess_res.json()["session_ref"]

    # 3. Eleanor posts message
    msg_res = await client.post(
        f"/api/v1/aria/sessions/{session_ref}/messages",
        json={"text": "I feel a bit calmer after going for a morning walk."},
        headers=eleanor_headers,
    )
    assert msg_res.status_code in [200, 201]
    msg_data = msg_res.json()
    assert msg_data["provider_name"] == "MOCK"
    assert msg_data["sender"] == "companion"

    # 4. Arthur attempts to read Eleanor's messages -> 403/404 Forbidden or Not Found (no enumeration)
    arthur_token = await get_token(client, "patient.arthur@synthetic.vericare.internal")
    arthur_headers = {"Authorization": f"Bearer {arthur_token}"}
    res_arthur = await client.get(
        f"/api/v1/aria/sessions/{session_ref}/messages",
        headers=arthur_headers,
    )
    assert res_arthur.status_code in [403, 404]


@pytest.mark.asyncio
async def test_log_and_audit_scrubbing_no_message_text(client: AsyncClient):
    """
    Audit events for Aria record only event type, actor, timestamp, and IDs.
    NEVER user message text, reply text, or draft summary text.
    """
    eleanor_token = await get_token(client, "patient.eleanor@synthetic.vericare.internal")
    eleanor_headers = {"Authorization": f"Bearer {eleanor_token}"}

    # Create session and send distinct sensitive text
    sess_res = await client.post(
        "/api/v1/aria/sessions",
        json={"title": "Log Scrubbing Verification Session"},
        headers=eleanor_headers,
    )
    session_ref = sess_res.json()["session_ref"]

    sensitive_text = "CONFIDENTIAL_PHRASE_NOT_TO_LEAK_INTO_AUDIT_LOGS_991827"
    send_res = await client.post(
        f"/api/v1/aria/sessions/{session_ref}/messages",
        json={"text": sensitive_text},
        headers=eleanor_headers,
    )
    assert send_res.status_code in [200, 201]

    # Check MongoDB audit_events collection
    db = await get_database()
    audit_events = await db.audit_events.find({
        "event_type": "ARIA_MESSAGE_SENT",
        "user_id": "USR-PATIENT-001",
    }).to_list(length=100)

    assert len(audit_events) > 0, "Expected ARIA_MESSAGE_SENT audit events"

    for ev in audit_events:
        ev_str = json.dumps(ev, default=str)
        # Invariant: Sensitive phrase must NOT appear in audit logs
        assert sensitive_text not in ev_str, f"Found message text leaked in audit event: {ev_str}"
        assert "CONFIDENTIAL_PHRASE" not in ev_str
        details = ev.get("details", {})
        assert "text" not in details
        assert "message" not in details
        assert "session_ref" in details or "session_id" in details


@pytest.mark.asyncio
async def test_draft_summary_not_visible_until_patient_approves(client: AsyncClient):
    """
    A draft summary generated by patient is NOT visible to clinician until patient explicitly approves it.
    """
    eleanor_token = await get_token(client, "patient.eleanor@synthetic.vericare.internal")
    eleanor_headers = {"Authorization": f"Bearer {eleanor_token}"}

    db = await get_database()
    await db.aria_shared_summaries.delete_many({"patient_id": "PAT-SYN-001"})

    # Create session & generate draft
    sess_res = await client.post(
        "/api/v1/aria/sessions",
        json={"title": "Draft Privacy Session"},
        headers=eleanor_headers,
    )
    session_ref = sess_res.json()["session_ref"]

    draft_res = await client.get(
        f"/api/v1/aria/sessions/{session_ref}/draft-summary",
        headers=eleanor_headers,
    )
    assert draft_res.status_code == 200
    assert "draft_text" in draft_res.json()

    # Clinician attempts to read shared summary for Eleanor
    doc_token = await get_token(client, "dr.marcus@synthetic.vericare.internal")
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    # Before patient approves, doctor GET returns 404 Not Found
    res_clinician = await client.get(
        "/api/v1/aria/shares/clinician/patient/PAT-SYN-001",
        headers=doc_headers,
    )
    assert res_clinician.status_code == 404
    assert "No shared Aria summary" in res_clinician.json()["error"]["message"]


@pytest.mark.asyncio
async def test_doctor_gets_only_approved_snapshot_and_subsequent_edits_do_not_mutate(client: AsyncClient):
    """
    Doctor gets ONLY the approved snapshot text.
    Subsequent patient reflections or regeneration of draft do NOT mutate the approved snapshot.
    """
    eleanor_token = await get_token(client, "patient.eleanor@synthetic.vericare.internal")
    eleanor_headers = {"Authorization": f"Bearer {eleanor_token}"}

    # 1. Create session
    sess_res = await client.post(
        "/api/v1/aria/sessions",
        json={"title": "Immutable Snapshot Verification"},
        headers=eleanor_headers,
    )
    session_ref = sess_res.json()["session_ref"]

    # 2. Patient approves immutable snapshot
    approved_text_v1 = "Patient approved reflection: Mild morning fatigue, no acute pain."
    share_res = await client.post(
        "/api/v1/aria/shares",
        json={
            "session_ref": session_ref,
            "recipient_id": "USR-DOC-CARDIO-001",
            "approved_text": approved_text_v1,
        },
        headers=eleanor_headers,
    )
    assert share_res.status_code == 201
    summary_id = share_res.json()["summary_id"]

    # 3. Doctor queries shared summary
    doc_token = await get_token(client, "dr.marcus@synthetic.vericare.internal")
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    clinician_read_1 = await client.get(
        "/api/v1/aria/shares/clinician/patient/PAT-SYN-001",
        headers=doc_headers,
    )
    assert clinician_read_1.status_code == 200
    assert clinician_read_1.json()["approved_text"] == approved_text_v1

    # 4. Patient adds new reflection message and generates fresh draft
    await client.post(
        f"/api/v1/aria/sessions/{session_ref}/messages",
        json={"text": "Later in the afternoon I felt much better."},
        headers=eleanor_headers,
    )
    await client.get(
        f"/api/v1/aria/sessions/{session_ref}/draft-summary",
        headers=eleanor_headers,
    )

    # 5. Doctor queries again -> STILL receives the original immutable snapshot!
    clinician_read_2 = await client.get(
        "/api/v1/aria/shares/clinician/patient/PAT-SYN-001",
        headers=doc_headers,
    )
    assert clinician_read_2.status_code == 200
    assert clinician_read_2.json()["approved_text"] == approved_text_v1
    assert clinician_read_2.json()["summary_id"] == summary_id


@pytest.mark.asyncio
async def test_revocation_immediately_blocks_clinician_read(client: AsyncClient):
    """
    When patient revokes summary access, clinician's next read is immediately blocked (403/404 + audit).
    """
    eleanor_token = await get_token(client, "patient.eleanor@synthetic.vericare.internal")
    eleanor_headers = {"Authorization": f"Bearer {eleanor_token}"}

    db = await get_database()
    await db.aria_shared_summaries.delete_many({"patient_id": "PAT-SYN-001"})

    sess_res = await client.post(
        "/api/v1/aria/sessions",
        json={"title": "Revocation Test Session"},
        headers=eleanor_headers,
    )
    session_ref = sess_res.json()["session_ref"]

    share_res = await client.post(
        "/api/v1/aria/shares",
        json={
            "session_ref": session_ref,
            "recipient_id": "USR-DOC-CARDIO-001",
            "approved_text": "Summary to be revoked.",
        },
        headers=eleanor_headers,
    )
    summary_id = share_res.json()["summary_id"]

    # Doctor can read
    doc_token = await get_token(client, "dr.marcus@synthetic.vericare.internal")
    doc_headers = {"Authorization": f"Bearer {doc_token}"}
    pre_revoke = await client.get("/api/v1/aria/shares/clinician/patient/PAT-SYN-001", headers=doc_headers)
    assert pre_revoke.status_code == 200

    # Patient revokes
    revoke_res = await client.post(f"/api/v1/aria/shares/{summary_id}/revoke", headers=eleanor_headers)
    assert revoke_res.status_code == 200
    assert revoke_res.json()["status"] == "revoked"

    # Doctor reads again -> blocked immediately!
    post_revoke = await client.get("/api/v1/aria/shares/clinician/patient/PAT-SYN-001", headers=doc_headers)
    assert post_revoke.status_code in [403, 404]

    # Verify audit event for revocation
    db = await get_database()
    audit_ev = await db.audit_events.find_one({
        "event_type": "ARIA_SHARE_REVOKED",
        "user_id": "USR-PATIENT-001",
    })
    assert audit_ev is not None


@pytest.mark.asyncio
async def test_provider_down_graceful_fallback():
    """
    When the companion service experiences an outage or connection failure,
    HttpAriaProvider returns a companion-unavailable response gracefully;
    the backend does not crash and the user's message is preserved.
    """
    # Create HttpAriaProvider pointing to an invalid / unreachable port
    down_provider = HttpAriaProvider(
        base_url="http://127.0.0.1:59999",
        timeout_seconds=0.5,
    )

    # Health check returns unavailable
    health = await down_provider.health()
    assert health.companion_available is False
    assert health.status in ["degraded", "unavailable"]

    # Send message handles failure gracefully
    resp = await down_provider.send_message(
        session_ref="SES-TEST-DOWN",
        pseudonymous_user_id="pseudo_test_user",
        text="Hello is anyone there?",
    )
    assert resp.provider_name in ["UNAVAILABLE", "ARIA_UNAVAILABLE"]
    assert "unavailable" in resp.reply_text.lower() or "unreachable" in resp.reply_text.lower()
    assert resp.safety_event is False

    # Draft summary handles failure gracefully
    draft_resp = await down_provider.draft_summary(
        session_ref="SES-TEST-DOWN",
        pseudonymous_user_id="pseudo_test_user",
    )
    assert "unavailable" in draft_resp.draft_text.lower()


@pytest.mark.asyncio
async def test_http_provider_contract_with_mocked_server():
    """
    Contract tests against a mocked HTTP server verifying the HTTP shape documented in docs/aria-integration.md.
    """
    def mock_handler(request: httpx.Request) -> httpx.Response:
        url_path = request.url.path
        if url_path == "/api/v1/health":
            return Response(200, json={"status": "healthy", "provider_name": "REAL_ARIA_EXTERNAL"})
        elif url_path.endswith("/messages"):
            body = json.loads(request.content)
            assert "pseudonymous_user_id" in body
            assert "text" in body
            return Response(
                200,
                json={
                    "reply_text": "I hear you. Tell me more about what you experienced today.",
                    "safety_event": False,
                    "provider_name": "REAL_ARIA_EXTERNAL",
                },
            )
        elif url_path.endswith("/draft-summary"):
            return Response(
                200,
                json={
                    "draft_text": "Patient reflected on sleep improvement over 3 sessions.",
                    "provider_name": "REAL_ARIA_EXTERNAL",
                },
            )
        elif "/sessions/" in url_path and request.method == "DELETE":
            return Response(200, json={"status": "deleted"})
        return Response(404, json={"detail": f"Not found: {url_path}"})

    transport = MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport, base_url="http://aria.internal.test") as mock_client:
        provider = HttpAriaProvider(base_url="http://aria.internal.test", client=mock_client)

        # 1. Health check
        health = await provider.health()
        assert health.companion_available is True
        assert health.status == "healthy"
        assert health.provider_name == "REAL_ARIA_EXTERNAL"

        # 2. Send message
        send_res = await provider.send_message(
            session_ref="SES-001",
            pseudonymous_user_id="pseudo_8819",
            text="I slept better last night.",
        )
        assert send_res.provider_name == "REAL_ARIA_EXTERNAL"
        assert "I hear you" in send_res.reply_text

        # 3. Draft summary
        draft_res = await provider.draft_summary(
            session_ref="SES-001",
            pseudonymous_user_id="pseudo_8819",
        )
        assert "sleep improvement" in draft_res.draft_text
        assert draft_res.provider_name == "REAL_ARIA_EXTERNAL"

        # 4. Delete session
        del_res = await provider.delete_session("SES-001")
        assert del_res is True


def test_crisis_safety_50_phrasings_suite():
    """
    Comprehensive 52-phrase synthetic crisis safety screening suite.
    Evaluates:
    - Direct suicide intent & severe crisis (positive triggers)
    - Negation handling ("I would never hurt myself", etc. - must NOT trigger)
    - Benign everyday distress and clinical statements (negative controls)
    - Multilingual expressions (Hindi, Marathi, Hinglish)
    """
    detector = CrisisSafetyDetector()

    test_cases = [
        # --- Group 1: Direct Suicidal Intent (Expected: Triggered = True) ---
        ("I want to kill myself", True, "direct intent"),
        ("I'm going to commit suicide tonight", True, "direct intent"),
        ("I want to die", True, "direct intent"),
        ("I have no reason to live anymore", True, "direct intent"),
        ("Thinking about ending it all", True, "direct intent"),
        ("I took a bottle of pills to end this", True, "self-harm overdose"),
        ("Good bye forever everyone", True, "farewell crisis"),
        ("I am going to cut myself", True, "self-harm cut"),
        ("Going to jump off the bridge", True, "direct intent jump"),
        ("Can't go on living like this", True, "borderline distress"),
        ("I want to slit my wrists", True, "self-harm wrist"),
        ("I feel suicidal today", True, "suicidal ideation"),
        ("Planning my suicide", True, "suicide planning"),
        ("Better off dead", True, "death wish"),
        ("Nobody will miss me when I'm gone", True, "severe hopelessness"),
        ("I wrote a suicide note", True, "suicide note"),
        ("Hanging myself soon", True, "direct intent hang"),
        ("I swallowed bleach", True, "self-harm poison"),
        ("Looking for ways to end my life quickly", True, "direct intent end life"),
        ("I just want everything to stop forever", True, "severe distress"),

        # --- Group 2: Explicit Negations (Expected: Triggered = False) ---
        ("I would never hurt myself", False, "negation would never"),
        ("I do not want to die", False, "negation do not want to die"),
        ("I want to live and see my children grow up", False, "affirmation want to live"),
        ("I will not commit suicide", False, "negation will not commit"),
        ("I have never thought of killing myself", False, "negation never thought of"),
        ("I'm not suicidal, just tired from work", False, "negation not suicidal"),
        ("I don't want to hurt myself at all", False, "negation don't want to hurt"),
        ("No thoughts of self-harm today", False, "negation no thoughts of self-harm"),
        ("I refused to give up on life", False, "negation refused to give up"),
        ("I am definitely not ending my life", False, "negation definitely not"),

        # --- Group 3: Everyday Distress & Benign Statements (Expected: Triggered = False) ---
        ("I had a stressful day at the office", False, "work stress"),
        ("My head hurts and I feel exhausted", False, "physical fatigue"),
        ("Feeling sad because of the rainy weather", False, "mild sadness"),
        ("I am anxious about my upcoming exam", False, "exam anxiety"),
        ("Need to sleep more hours", False, "sleep desire"),
        ("Fell down and scraped my knee", False, "physical minor injury"),
        ("Had an argument with my neighbor", False, "interpersonal conflict"),
        ("My medication is causing nausea", False, "medication side effect"),
        ("Excited for my vacation tomorrow", False, "positive emotion"),
        ("I felt happy after talking with my friend", False, "positive social"),

        # --- Group 4: Multilingual & Cross-Cultural Expressions (Expected: Triggered = True) ---
        ("mujhe jeena nahi hai", True, "Hinglish: do not want to live"),
        ("main khudkushi karna chahta hoon", True, "Hinglish: want to commit suicide"),
        ("apni jaan lena chahta hoon", True, "Hinglish: want to take life"),
        ("mala jagaaycha nahi aahe", True, "Marathi Latin: do not want to live"),
        ("aatamhatya karaychi aahe", True, "Marathi Latin: want to commit suicide"),
        ("जीव संपवायचा आहे", True, "Marathi Devanagari: want to end life"),
        ("आत्महत्या करायची आहे", True, "Marathi Devanagari: want to commit suicide"),
        ("marne ka man kar raha hai", True, "Hinglish: feel like dying"),
        ("mujhe mar jana hai", True, "Hinglish: I have to die"),
        ("जीवन संपवण्याचा विचार", True, "Marathi Devanagari: thoughts of ending life"),
        ("mujhe zinda nahi rehna", True, "Hinglish: do not want to remain alive"),
        ("khud ko khatam karna hai", True, "Hinglish: want to finish myself"),
    ]

    total = len(test_cases)
    passed = 0
    tp = 0  # True Positive
    tn = 0  # True Negative
    fp = 0  # False Positive
    fn = 0  # False Negative
    results_log = []

    for phrase, expected_trigger, category in test_cases:
        res = detector.check_message(phrase)
        is_pass = (res.triggered == expected_trigger)
        if is_pass:
            passed += 1
            if expected_trigger:
                tp += 1
            else:
                tn += 1
        else:
            if res.triggered and not expected_trigger:
                fp += 1
            else:
                fn += 1

        results_log.append({
            "phrase": phrase,
            "category": category,
            "expected": expected_trigger,
            "actual": res.triggered,
            "status": "PASS" if is_pass else "FAIL",
            "matched_phrase": res.matched_phrase,
            "reason": res.reason,
        })

    # Print evaluation report
    print("\n" + "=" * 80)
    print("CRISIS SAFETY SCREENING SUITE: 52 TEST PHRASES")
    print("=" * 80)
    print(f"Total Cases: {total} | Passed: {passed} | Failed: {total - passed}")
    print(f"True Positives: {tp} | True Negatives: {tn} | False Positives: {fp} | False Negatives: {fn}")
    print(f"Accuracy: {passed / total * 100:.1f}%")
    print("-" * 80)
    print(f"{'Status':<6} | {'Expected':<8} | {'Actual':<8} | {'Category':<22} | Phrase")
    print("-" * 80)
    for entry in results_log:
        status_flag = "PASS" if entry["status"] == "PASS" else "FAIL"
        print(f"{status_flag:<6} | {str(entry['expected']):<8} | {str(entry['actual']):<8} | {entry['category']:<22} | \"{entry['phrase']}\"")
    print("=" * 80 + "\n")

    assert passed == total, f"Crisis safety test failed: {total - passed} mismatches out of {total} cases."
