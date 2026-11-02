# Aria Mental-Health Companion — VeriCare Integration Contract

> **Integration Notice**: VeriCare is an academic clinical governance and verification platform. Aria is an independent mental-health companion service developed separately. VeriCare interfaces with Aria **strictly through this integration contract**. VeriCare never trains, hosts, or imitates Aria's ML models or conversational intelligence.

---

## 1. Architectural & Privacy Boundaries

1. **Strict Data Boundary**:
   - **Zero Medical Record Leakage**: VeriCare **never** sends real patient names, internal MRNs, dates of birth, clinical notes, allergies, or medication records to Aria.
   - **Pseudonymous Identifiers Only**: Aria receives only an opaque, deterministic pseudonymous identifier derived server-side via keyed hash:
     $$\text{pseudonymous\_user\_id} = \text{HMAC-SHA256}(\text{patient\_id}, \text{SECRET\_SALT})$$
     Aria has zero mechanism to re-identify patients.
2. **Collection Isolation**:
   - All companion interactions reside exclusively in dedicated MongoDB collections:
     - `aria_sessions`
     - `aria_messages`
     - `aria_sharing_authorizations`
     - `aria_shared_summaries`
   - **Absolute Wall**: Data from these collections **never** populates EHR clinical records, patient timelines, medical search, clinical worklists, Second Memory, or emergency break-glass summaries.
3. **Owner-Only Patient Access**:
   - Only the authenticated patient who authored the session can read, send messages to, or delete their Aria sessions.
   - Clinicians, verifiers, hospital admins, system admins, and emergency break-glass requests are **strictly forbidden** (`403 Forbidden` with immutable audit logging).
4. **Audit Log Scrubbing**:
   - VeriCare audit events for Aria interactions record solely event types, timestamps, user IDs, and session IDs. **Message bodies and summary texts are never written to audit logs or system loggers.**

---

## 2. Python Provider Contract (`AriaProvider`)

The interface is defined as a Python `Protocol` / `ABC` in [`backend/app/integrations/aria/base.py`](file:///c:/Users/Raj/Desktop/VeriCare/backend/app/integrations/aria/base.py) with typed Pydantic models:

```python
from abc import ABC, abstractmethod
from pydantic import BaseModel, Field

class AriaHealthStatus(BaseModel):
    status: str = Field(..., description="Service status: 'healthy', 'degraded', or 'unavailable'")
    mode: str = Field(..., description="'mock' or 'http'")
    provider_name: str = Field(..., description="Provider descriptor (e.g. 'MOCK' or real provider label)")
    latency_ms: float | None = None

class AriaSendMessageRequest(BaseModel):
    session_ref: str = Field(..., description="Opaque session identifier")
    pseudonymous_user_id: str = Field(..., description="Server-derived pseudonymous patient hash")
    text: str = Field(..., description="User message content")

class AriaSendMessageResponse(BaseModel):
    reply_text: str = Field(..., description="Companion message response")
    safety_event: bool = Field(default=False, description="Whether safety intervention occurred")
    provider_name: str = Field(..., description="Label of provider (e.g. 'MOCK')")

class AriaDraftSummaryRequest(BaseModel):
    session_ref: str = Field(..., description="Opaque session identifier")
    pseudonymous_user_id: str = Field(..., description="Server-derived pseudonymous patient hash")

class AriaDraftSummaryResponse(BaseModel):
    draft_text: str = Field(..., description="Patient-editable draft summary")
    provider_name: str = Field(...)

class AriaProvider(ABC):
    @abstractmethod
    async def health(self) -> AriaHealthStatus:
        """Returns health status, active mode, and latency."""
        ...

    @abstractmethod
    async def send_message(
        self, session_ref: str, pseudonymous_user_id: str, text: str
    ) -> AriaSendMessageResponse:
        """Sends a message and returns the companion reply."""
        ...

    @abstractmethod
    async def draft_summary(
        self, session_ref: str, pseudonymous_user_id: str
    ) -> AriaDraftSummaryResponse:
        """Drafts a high-level summary of the session for patient review."""
        ...

    @abstractmethod
    async def delete_session(self, session_ref: str) -> bool:
        """Notifies Aria to purge conversational state for the given session."""
        ...
```

---

## 3. Equivalent External HTTP Specification

When configured with `ARIA_MODE=http`, `HttpAriaProvider` calls the following HTTP endpoints:

### Headers
```http
Authorization: Bearer <ARIA_API_KEY>
Content-Type: application/json
Accept: application/json
```
- **Default Timeout**: 10 seconds (`ARIA_TIMEOUT_SECONDS`)
- **Resilience Policy**: If Aria is unreachable or times out, VeriCare fails gracefully without losing the patient's submitted message.

### Endpoints

#### 1. Health Probe
- **Method & Path**: `GET /api/v1/health`
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "provider_name": "Aria Production Mental Health v1.0",
  "model_version": "aria-dialog-2026-q4"
}
```

#### 2. Send Message
- **Method & Path**: `POST /api/v1/sessions/{session_ref}/messages`
- **Request Body**:
```json
{
  "pseudonymous_user_id": "aria_pseudo_usr_7f8a9b1c2d3e4f5a",
  "text": "I have been feeling overwhelmed with my graduate exams lately."
}
```
- **Response `200 OK`**:
```json
{
  "reply_text": "I hear how demanding graduate school can be. Would you like to break down what feels most urgent right now?",
  "safety_event": false,
  "provider_name": "Aria Production Mental Health v1.0"
}
```

#### 3. Draft Session Summary
- **Method & Path**: `POST /api/v1/sessions/{session_ref}/draft-summary`
- **Request Body**:
```json
{
  "pseudonymous_user_id": "aria_pseudo_usr_7f8a9b1c2d3e4f5a"
}
```
- **Response `200 OK`**:
```json
{
  "draft_text": "Discussion focused on academic stress and daily routine management. Patient identified sleep hygiene as a goal.",
  "provider_name": "Aria Production Mental Health v1.0"
}
```

#### 4. Delete Session
- **Method & Path**: `DELETE /api/v1/sessions/{session_ref}`
- **Response `200 OK` or `204 No Content`**:
```json
{
  "deleted": true
}
```

---

## 4. Defense-in-Depth Crisis Safety Layer

VeriCare implements a **deterministic crisis safety interception filter** at the integration boundary ([`backend/app/integrations/aria/safety/`](file:///c:/Users/Raj/Desktop/VeriCare/backend/app/integrations/aria/safety/)):
- **Pre-Provider & Post-Provider Execution**: Every message authored by the user is screened *before* calling the provider, and every response from the provider is screened *before* rendering.
- **Rule-Based Negation & Borderline Handling**: Deterministic token patterns with negation handling (e.g. *"I would never hurt myself"* does not trigger suicide intent, while borderline self-harm phrases lean toward presenting compassionate support).
- **Crisis Response Interception**: When triggered, the provider call is bypassed, and fixed compassionate guidance is returned referencing accredited crisis resources from [`config/crisis_resources.json`](file:///c:/Users/Raj/Desktop/VeriCare/config/crisis_resources.json) (marked with `"VERIFY BEFORE USE"` placeholders).
- **Important**: This boundary filter is a **defense-in-depth safety net**, not a replacement for clinical care or native model safety. The Aria service owner must clarify whether Aria provides its own crisis classification.

---

## 5. Handoff Checklist for the Aria Owner

When ready to connect the real Aria service to VeriCare, the Aria service owner must confirm and complete the following items:

- [ ] **1. Endpoint Mapping**: Confirm that the real Aria HTTP endpoints, routing prefixes, and URL parameters match Section 3 or configure URL rewrites.
- [ ] **2. Authentication Mechanism**: Provide the production API token / bearer credentials and confirm whether token rotation is supported.
- [ ] **3. Data Storage & Retention**: Confirm where conversational transcripts and session buffers are stored, verify that no VeriCare PHI/PII is retained, and confirm data retention / session deletion SLA.
- [ ] **4. Native Crisis-Safety Layer**: Clarify whether Aria executes its own internal crisis-safety classification, and describe expected behavior when distress is detected.
- [ ] **5. Underlying LLM Provider & Inference Host**: Disclose which LLM provider, inference cloud, or on-prem cluster processes conversational messages (e.g. self-hosted LLaMA, OpenAI, Anthropic, Gemini).
- [ ] **6. Calibration & Disclaimers**: Disclose conversational boundaries, therapeutic limits, latency expectations, and mandatory disclaimers to display to patients.
- [ ] **7. Switch Provider Configuration**: Update VeriCare environment variables:
  ```bash
  ARIA_MODE=http
  ARIA_BASE_URL=https://aria.internal.hospital.org
  ARIA_API_KEY=prod_aria_secret_key_xxxx
  ARIA_TIMEOUT_SECONDS=10.0
  ARIA_PROVIDER_LABEL="Aria Mental-Health Companion v1.0"
  ```
