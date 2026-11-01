import pymupdf
import pytest
from httpx import AsyncClient
from backend.app.ai.llm_provider import MockLLMProvider, set_llm_provider
from backend.app.core.config import settings
from backend.app.core.database import get_database

SYNTHETIC_PASSWORD = "synthetic-dev-password"


def create_synthetic_clinical_pdf(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def get_doctor_token(client: AsyncClient) -> str:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "dr.marcus@synthetic.vericare.internal", "password": SYNTHETIC_PASSWORD},
    )
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.fixture(autouse=True)
def reset_provider():
    """Ensures a clean default MockLLMProvider is used for each test."""
    provider = MockLLMProvider()
    set_llm_provider(provider)
    yield provider
    # Teardown
    set_llm_provider(MockLLMProvider())


@pytest.mark.asyncio
async def test_valid_pdf_upload_and_extraction(client: AsyncClient, reset_provider: MockLLMProvider):
    """
    Validates standard upload flow:
      - Valid magic bytes (%PDF-)
      - Content hash calculation
      - Extracted text with character offsets
      - Grounding verification of source spans
      - Status strictly saved as pending_review in untrusted_documents collection
    """
    token = await get_doctor_token(client)
    pdf_content = (
        "CLINICAL DISCHARGE SUMMARY\n"
        "Patient: Eleanor Vance\n"
        "Prescribed: Metoprolol 25mg PO BID for rate control\n"
        "Condition: Atrial Fibrillation stable"
    )
    pdf_bytes = create_synthetic_clinical_pdf(pdf_content)

    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("discharge_summary.pdf", pdf_bytes, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending_review"
    assert "content_hash" in data
    assert data["page_count"] >= 1
    assert data["is_idempotent_replay"] is False

    # Check verified field
    med_fields = [f for f in data["fields"] if f["field_name"] == "medication"]
    assert len(med_fields) == 1
    med = med_fields[0]
    assert med["value"] == "Metoprolol"
    assert med["grounding_verified"] is True
    assert med["source_span"] is not None
    assert med["source_span"]["quote"] == "Metoprolol"

    # Invariant: Record must be in untrusted_documents collection as pending_review
    db = await get_database()
    doc_in_db = await db.untrusted_documents.find_one({"document_id": data["document_id"]})
    assert doc_in_db is not None
    assert doc_in_db["status"] == "pending_review"
    assert doc_in_db["patient_id"] == "PAT-SYN-001"


@pytest.mark.asyncio
async def test_hallucinated_span_rejected_and_downgraded(client: AsyncClient, reset_provider: MockLLMProvider):
    """
    MANDATORY REQUIREMENT:
    When the LLM hallucinates an offset or provides a quote that does NOT match the document
    text at that exact offset, the span MUST be rejected, the field status downgraded to 'uncertain',
    and the failure logged.
    """
    token = await get_doctor_token(client)
    reset_provider.force_hallucinated_span = True

    pdf_content = "Patient: Eleanor Vance\nMedication: Metoprolol 25mg\nDiagnosis: Paroxysmal AFib"
    pdf_bytes = create_synthetic_clinical_pdf(pdf_content)

    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("hallucination_test.pdf", pdf_bytes, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()

    # The hallucinated field must have been detected, downgraded to 'uncertain', and stripped of ungrounded span
    med_fields = [f for f in data["fields"] if f["field_name"] == "medication"]
    assert len(med_fields) == 1
    med = med_fields[0]
    assert med["grounding_verified"] is False
    assert med["status"] == "uncertain"
    assert med["source_span"] is None
    assert "GROUNDING FAILED" in med["confidence_note"]


@pytest.mark.asyncio
async def test_malformed_json_handled_by_bounded_repair_loop(client: AsyncClient, reset_provider: MockLLMProvider):
    """
    Verifies that malformed JSON returned by the LLM invokes the bounded repair loop (max 2),
    and if parsing fails, fails safely without crashing the service or leaking internal errors.
    """
    token = await get_doctor_token(client)
    reset_provider.force_malformed = True

    pdf_bytes = create_synthetic_clinical_pdf("Simple clinical document text")

    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("malformed_test.pdf", pdf_bytes, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending_review"
    assert data["repair_attempts"] <= 2


@pytest.mark.asyncio
async def test_idempotent_reupload_returns_existing_record(client: AsyncClient, reset_provider: MockLLMProvider):
    """
    Verifies that re-uploading the exact same document for a patient computes the same
    SHA-256 content hash and returns the existing pending_review record without creating duplicates.
    """
    token = await get_doctor_token(client)
    pdf_bytes = create_synthetic_clinical_pdf("Unique text for idempotency check: Metoprolol 50mg")

    # 1. Initial upload
    res1 = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("idempotency.pdf", pdf_bytes, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}", "X-Request-ID": "req-1234"},
    )
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["is_idempotent_replay"] is False
    doc_id1 = data1["document_id"]
    content_hash = data1["content_hash"]

    # 2. Retry upload with identical content
    res2 = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("idempotency.pdf", pdf_bytes, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}", "X-Request-ID": "req-1234"},
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["is_idempotent_replay"] is True
    assert data2["document_id"] == doc_id1

    # Verify no duplicate was inserted into DB
    db = await get_database()
    count = await db.untrusted_documents.count_documents({
        "content_hash": content_hash,
        "patient_id": "PAT-SYN-001",
    })
    assert count == 1


@pytest.mark.asyncio
async def test_provider_down_behavior_fails_safely(client: AsyncClient, reset_provider: MockLLMProvider):
    """
    App must work if provider is down:
    When LLM provider raises LLMProviderDownError (service unavailable/timeout),
    the application fails safely, stores the document as pending_review with outage notes,
    and returns 201 without throwing a 500.
    """
    token = await get_doctor_token(client)
    reset_provider.force_down = True

    pdf_bytes = create_synthetic_clinical_pdf("Patient report during LLM outage")

    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("outage_test.pdf", pdf_bytes, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending_review"
    assert data["fields"] == []


@pytest.mark.asyncio
async def test_invalid_magic_bytes_rejected(client: AsyncClient):
    """Verifies that non-PDF files (invalid magic bytes) are rejected with 400 Bad Request."""
    token = await get_doctor_token(client)
    fake_pdf = b"THIS IS NOT A VALID PDF FILE HEADER"

    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("malicious.pdf", fake_pdf, "application/pdf")},
        data={"patient_id": "PAT-SYN-001"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    err = response.json()
    assert err["error"]["code"] == "BAD_REQUEST"
    assert "magic bytes" in err["error"]["message"].lower()


@pytest.mark.asyncio
async def test_size_cap_enforced(client: AsyncClient):
    """Verifies that files exceeding MAX_UPLOAD_SIZE_BYTES are rejected with 413."""
    token = await get_doctor_token(client)
    # Temporarily set max upload size to 1000 bytes for testing
    original_cap = settings.MAX_UPLOAD_SIZE_BYTES
    settings.MAX_UPLOAD_SIZE_BYTES = 500
    try:
        oversized = b"%PDF-1.4 " + (b"A" * 600)
        response = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("oversized.pdf", oversized, "application/pdf")},
            data={"patient_id": "PAT-SYN-001"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 413
        err = response.json()
        assert "exceeds maximum allowed upload size" in err["error"]["message"]
    finally:
        settings.MAX_UPLOAD_SIZE_BYTES = original_cap
