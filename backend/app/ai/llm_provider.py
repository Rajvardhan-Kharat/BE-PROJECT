import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import httpx
from backend.app.core.config import settings

logger = logging.getLogger("vericare.ai.llm")


class LLMProviderError(Exception):
    """Base exception for LLM provider issues."""
    pass


class LLMProviderDownError(LLMProviderError):
    """Raised when LLM provider is unreachable, down, or timed out."""
    pass


class BaseLLMProvider(ABC):
    provider_name: str

    @abstractmethod
    async def extract_clinical_json(
        self,
        document_text: str,
        page_map: Dict[int, str],
        doc_id: str,
    ) -> str:
        """Returns raw JSON extraction string."""
        pass

    @abstractmethod
    async def repair_malformed_json(
        self,
        malformed_json: str,
        error_message: str,
    ) -> str:
        """Attempts to repair malformed JSON given the parse error."""
        pass


class MockLLMProvider(BaseLLMProvider):
    """
    EXPLICITLY LABELED MOCK PROVIDER (ACADEMIC SYNTHETIC PROTOTYPE).
    Returns deterministic, verifiable extraction payloads based on document content.
    Includes testing toggles for provider outage and hallucinated spans.
    """
    provider_name = "MOCK_LLM_PROVIDER (SYNTHETIC LABELED)"

    def __init__(self):
        self.force_down: bool = False
        self.force_malformed: bool = False
        self.force_hallucinated_span: bool = False

    async def extract_clinical_json(
        self,
        document_text: str,
        page_map: Dict[int, str],
        doc_id: str,
    ) -> str:
        if self.force_down:
            logger.error("MockLLMProvider simulated outage triggered.")
            raise LLMProviderDownError("LLM Provider is unreachable (503 Service Unavailable).")

        if self.force_malformed:
            # Return broken/malformed JSON with unclosed braces/syntax error
            return '{"fields": [{"field_name": "medication", "value": "Metoprolol", "status": "explicit", "source_span": {'

        first_page = 1
        page_text = page_map.get(first_page, document_text)

        # Build dynamic fields grounded in actual document text
        fields = []

        # 1. Search for a medication in document
        candidate_terms = [
            ("Metoprolol", "Medication for atrial fibrillation rate control"),
            ("Aspirin", "Antiplatelet therapy"),
            ("Warfarin", "Anticoagulation therapy"),
            ("Atorvastatin", "Lipid-lowering statin"),
        ]

        found_med = False
        for term, note in candidate_terms:
            idx = page_text.find(term)
            if idx != -1:
                start_offset = idx
                end_offset = idx + len(term)

                if self.force_hallucinated_span:
                    # Deliberately point to wrong character offset
                    start_offset = max(0, idx - 20)
                    end_offset = start_offset + len(term)

                fields.append({
                    "field_name": "medication",
                    "value": term,
                    "confidence_note": f"Found exact mention in discharge summary text. {note}",
                    "status": "explicit",
                    "source_span": {
                        "doc": doc_id,
                        "page": first_page,
                        "start": start_offset,
                        "end": end_offset,
                        "quote": term,
                    },
                })
                found_med = True
                break

        if not found_med:
            # Fallback medication grounded in text
            if len(page_text) > 10:
                sample_word = page_text.split()[0] if page_text.split() else "Clinical"
                idx = page_text.find(sample_word)
                fields.append({
                    "field_name": "clinical_keyword",
                    "value": sample_word,
                    "confidence_note": "Extracted primary document token",
                    "status": "explicit",
                    "source_span": {
                        "doc": doc_id,
                        "page": first_page,
                        "start": idx if idx != -1 else 0,
                        "end": (idx + len(sample_word)) if idx != -1 else len(sample_word),
                        "quote": sample_word,
                    },
                })

        # 2. Add an inferred field
        fields.append({
            "field_name": "clinical_acuity",
            "value": "Moderate",
            "confidence_note": "Inferred from observation frequency and monitoring records",
            "status": "inferred",
            "source_span": None,
        })

        # 3. Add a missing field
        fields.append({
            "field_name": "creatinine_clearance",
            "value": None,
            "confidence_note": "Lab panel omitted renal function assessment",
            "status": "missing",
            "source_span": None,
        })

        payload = {"fields": fields}
        return json.dumps(payload, indent=2)

    async def repair_malformed_json(
        self,
        malformed_json: str,
        error_message: str,
    ) -> str:
        if self.force_down:
            raise LLMProviderDownError("LLM Provider is unreachable during repair.")

        logger.info("MockLLMProvider repairing malformed JSON (error: %s)", error_message)
        # Attempt minimal repair by parsing or returning minimal valid structure
        cleaned = malformed_json.strip()
        if not cleaned.endswith("}"):
            cleaned += '}]}'
        try:
            json.loads(cleaned)
            return cleaned
        except Exception:
            return '{"fields": []}'


class RealLLMProviderStub(BaseLLMProvider):
    """
    Real provider stub interfacing with external LLM API (OpenAI/Anthropic compatible) via settings.
    Gracefully handles connection failures, timeouts, and rate limits without taking down VeriCare.
    """
    provider_name = "REAL_LLM_PROVIDER_STUB"

    def __init__(self):
        self.api_key = settings.LLM_API_KEY
        self.api_url = settings.LLM_API_URL
        self.model = settings.LLM_MODEL
        self.timeout = settings.LLM_TIMEOUT_SECONDS

    async def extract_clinical_json(
        self,
        document_text: str,
        page_map: Dict[int, str],
        doc_id: str,
    ) -> str:
        if not self.api_key:
            logger.warning("LLM_API_KEY not configured. Falling back to MockLLMProvider.")
            mock = MockLLMProvider()
            return await mock.extract_clinical_json(document_text, page_map, doc_id)

        prompt = (
            "Extract clinical fields as strict JSON with fields array. "
            "For each field provide field_name, value, confidence_note, status (explicit, inferred, uncertain, missing, conflicting), "
            "and source_span with doc, page (1-indexed), start (char offset), end (char offset), quote (exact string).\n\n"
            f"Document text:\n{document_text[:8000]}"
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a clinical extraction engine. Output strict JSON only."},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(f"{self.api_url}/chat/completions", headers=headers, json=body)
                if res.status_code >= 500:
                    raise LLMProviderDownError(f"External LLM service returned status {res.status_code}")
                res.raise_for_status()
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                return content
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as net_err:
            logger.error("External LLM Provider connection failed: %s", net_err)
            raise LLMProviderDownError(f"External LLM Provider connection failed: {str(net_err)}") from net_err

    async def repair_malformed_json(
        self,
        malformed_json: str,
        error_message: str,
    ) -> str:
        if not self.api_key:
            return '{"fields": []}'

        repair_prompt = f"Fix this broken JSON to be valid JSON. Return ONLY the repaired JSON:\n{malformed_json}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a JSON repair tool. Output valid JSON only."},
                {"role": "user", "content": repair_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(f"{self.api_url}/chat/completions", headers=headers, json=body)
                res.raise_for_status()
                return res.json()["choices"][0]["message"]["content"]
        except Exception as err:
            logger.error("Failed to repair JSON via external provider: %s", err)
            raise LLMProviderDownError(f"Repair request failed: {str(err)}") from err


# Provider singleton / factory
_active_provider: Optional[BaseLLMProvider] = None


def get_llm_provider() -> BaseLLMProvider:
    global _active_provider
    if _active_provider is None:
        if settings.LLM_PROVIDER_TYPE == "real_stub" and settings.LLM_API_KEY:
            _active_provider = RealLLMProviderStub()
        else:
            _active_provider = MockLLMProvider()
    return _active_provider


def set_llm_provider(provider: BaseLLMProvider) -> None:
    """Testing override for injecting mock or failing providers."""
    global _active_provider
    _active_provider = provider
