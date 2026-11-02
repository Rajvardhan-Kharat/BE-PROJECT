# VeriCare AI: Clinical Verification & AI Governance Platform

> **Academic Prototype Notice**: This system operates strictly on synthetic, de-identified clinical datasets for research, verification methodology design, and governance testing. It contains no Protected Health Information (PHI) and is not intended for direct autonomous medical diagnosis or unsupervised prescription modification.

VeriCare AI is an enterprise-grade clinical verification, safety governance, and AI provenance architecture. It solves the critical safety gap between probabilistic AI extractions and trusted electronic health record (EHR) systems by enforcing deterministic clinical safety guardrails, append-only record versioning, multi-specialty human verification, and cross-hospital conflict auditing.

---

## 1. Quick Start

### Prerequisites
- **Python 3.11+**
- **Node.js 18+ & npm**
- **MongoDB 6.0+** running locally on default port `27017`

### Setup & One-Command Database Seed

#### PowerShell (Windows)
```powershell
# 1. Clone & navigate to workspace
cd c:\Users\Raj\Desktop\VeriCare

# 2. Setup Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# 3. Setup Frontend dependencies
npm --prefix frontend install

# 4. Master Database Seed (Indexes, synthetic patients, users, demo encounters)
python scripts/seed.py
```

#### Bash (Linux / macOS)
```bash
# 1. Clone & navigate to workspace
cd VeriCare

# 2. Setup Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 3. Setup Frontend dependencies
npm --prefix frontend install

# 4. Master Database Seed
python3 scripts/seed.py
```

### Running the Platform

#### PowerShell (Windows)
```powershell
# Terminal 1: Backend API Server (FastAPI)
.\venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload --port 8000

# Terminal 2: Frontend Client (Vite + React)
npm --prefix frontend run dev
```

#### Bash (Linux / macOS)
```bash
# Terminal 1: Backend API Server (FastAPI)
source venv/bin/activate
uvicorn backend.app.main:app --reload --port 8000

# Terminal 2: Frontend Client (Vite + React)
npm --prefix frontend run dev
```

The web application will be available at **`http://localhost:5173`**, and the interactive OpenAPI documentation at **`http://localhost:8000/docs`**.

---

## 2. Seed Accounts & Credentials

All seeded accounts use password: `synthetic-dev-password`

| Role | Email | User ID | Clinical Scope |
| :--- | :--- | :--- | :--- |
| **Senior Doctor (Verifier)** | `dr.lin@vericare.local` | `USR-VERIFIER-001` | Metro Health Medical Center (Internal Medicine) |
| **Doctor (Cardiology)** | `dr.marcus@vericare.local` | `USR-DOC-CARDIO-001` | Metro Health Medical Center (Cardiology) |
| **Doctor (Ward)** | `dr.chen@vericare.local` | `USR-DOC-METRO-001` | Metro Health Medical Center (Ward A) |
| **Patient** | `eleanor.vance@synthetic.local` | `PAT-SYN-001` | Eleanor Vance (MRN: `SYN-84920`) |
| **Hospital Administrator** | `admin.metro@vericare.local` | `USR-ADMIN-001` | Metro Health Governance & Overrides |
| **System Administrator** | `system.admin@vericare.local` | `USR-SYS-001` | Platform Configuration & Security Logs |

---

## 3. System Architecture

```
                                  [ Web Client: React + TypeScript + Tailwind ]
                                                        │
                                                        │ REST / JSON (JWT + Scope)
                                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FastAPI Application Core (Default-Deny Middleware, CORS, Security Headers, Rate Limiting)          │
├──────────────────────────────────────┬────────────────────────────────────┬───────────────────────┤
│ API v1 Layer                         │ Services & Governance Engines      │ AI Agent Subsystems   │
│ - /auth, /patients, /documents       │ - DocumentService (magic bytes,    │ - Agent 1: Extraction │
│ - /verification, /safety             │   SHA-256 hash, span grounding)    │   & Span Grounding    │
│ - /timeline/audit, /emergency        │ - SafetyEngine (deterministic DDI) │ - Agent 2: Safety     │
│ - /followups, /collaboration         │ - VerificationService (immutable   │ - Agent 3: Verifier   │
│ - /consent, /break-glass, /aria      │   append-only record versions)     │ - Agent 4: Emergency  │
│ - /metrics/corrections, /audit       │ - Consent & BreakGlassService      │ - Agent 5: Follow-Up  │
└──────────────────────────────────────┴────────────────────────────────────┴───────────────────────┘
                                                        │
                                                        │ Motor (Async MongoDB Driver)
                                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MongoDB Storage Tier (Strict Logical Partitioning)                                                │
├──────────────────────────────────────┬────────────────────────────────────┬───────────────────────┤
│ Untrusted Collections (AI Sandbox)   │ Trusted Clinical Collections       │ Privacy Collections   │
│ - untrusted_documents                │ - patients, encounters             │ - aria_sessions       │
│ - document_extractions               │ - record_versions (append-only)    │ - aria_messages       │
│ - pending_verifications              │ - prescriptions, clinical_alerts   │ - aria_authorizations │
│                                      │ - audit_events (immutable)         │ - patient_consents    │
└──────────────────────────────────────┴────────────────────────────────────┴───────────────────────┘
```

### Architectural Guarantees
1. **Physical & Logical Partitioning**: Untrusted AI document extractions reside strictly in `untrusted_documents`. AI processes have zero write path to `record_versions` or approved clinical collections.
2. **Deterministic Pharmacology**: Drug-drug interactions, duplicate prescription detections, and allergy conflicts are computed purely by deterministic reference rules (`synthetic_data/drug_reference/drug_reference_v1.json`). **No LLM is permitted to generate pharmacology conclusions.**
3. **Immutable Append-Only Audit**: Approving a proposal marks the prior record as `superseded` and creates a new version with submitter, verifier, and timestamp metadata. Prior versions are never overwritten.
4. **Adherence Non-Inference**: Agent 5 evaluates schedule deltas using calendar math only; it is architecturally prohibited from computing or inferring patient medication compliance.

---

## 4. AI Agents Specification

| Agent ID | Name | Role | Determinism / Model Boundary |
| :--- | :--- | :--- | :--- |
| **Agent 1** | Document Extraction Agent | Extracts medications, doses, and allergies from text PDFs preserving char offsets | Structured JSON schema; strictly validates that extracted quotes match offsets; downgrades or rejects hallucinations |
| **Agent 2** | Clinical Safety Engine | Evaluates drug interactions, allergy contraindications, and dose bounds | 100% Deterministic Rule Engine; zero LLM hallucination risk |
| **Agent 3** | Verification Assistant | Identifies missing fields, cross-encounter diffs, and verification recommendations | Deterministic difference engine; LLM optional only for sentence smoothing in reviewer notes |
| **Agent 4** | Emergency Summary Agent | Compiles 4-quadrant profile (Verified, Pending, Conflicting, Missing) | Deterministic aggregation; empty allergy list displays *"Allergy information unavailable"* (never assumes "none") |
| **Agent 5** | Follow-Up Tracking Agent | Tracks calendar course intervals for appointments and medications | Deterministic date math; explicitly flags `adherence_inferred: False` |

---

## 5. Security Model & Governance

- **Default-Deny Role-Based Access Control (RBAC)**: All routes evaluate user role, facility scope, care-team membership, and active consent before executing database reads or writes.
- **Span Grounding & Prompt Injection Defense**:
  - Validates `%PDF-` magic bytes, enforces a 10MB size cap, and hashes content with SHA-256.
  - Extraction prompts use strict structural schema delimiters separating untrusted text from instructions.
  - Tested against 8 synthetic adversarial injection attack vectors (zero unauthorized executions or permission escalations).
- **Consent Directives**:
  - Granular patient directives (purpose, recipient, categories, validity window) enforced in backend on every query.
  - Revocation immediately terminates clinical data sharing.
- **Emergency Break-Glass Override**:
  - Non-care-team clinicians can request temporary (60 min) emergency view with mandatory clinical justification (`min 10 characters`).
  - Rate-limited to 5 requests per hour.
  - Emits immutable high-priority audit events and immediate in-app patient notifications.
  - Audited by Hospital Administrators (`justified` vs `questioned`).
- **Aria Mental-Health Companion Boundary**:
  - Completely isolated storage (`aria_sessions`, `aria_messages`).
  - Real patient names, MRNs, and medical records are never sent to companion providers; routing uses pseudonymous HMAC identifiers.
  - Client-side crisis safety gate detects self-harm intent, bypasses provider calls, and displays 24/7 human crisis resources.

---

## 6. Core API Endpoints

### Authentication & Patients
- `POST /api/v1/auth/login` - Authenticate and receive scoped JWT
- `GET /api/v1/patients/{id}` - Retrieve patient clinical overview (care team scoped)

### Ingestion & Verification
- `POST /api/v1/documents/upload` - Ingest PDF, extract fields, validate span offsets
- `GET /api/v1/documents/{id}` - View document extraction and span highlights
- `GET /api/v1/verification/queue` - Retrieve pending verifications for active verifier scope
- `POST /api/v1/verification/{id}/decide` - Approve, reject, or request correction (audit logged)

### Clinical Safety & Audits
- `POST /api/v1/patients/{id}/safety/run-checks` - Run deterministic drug interaction checks
- `GET /api/v1/patients/{id}/timeline/audit` - Multi-hospital chronological timeline conflict audit
- `GET /api/v1/patients/{id}/emergency-summary` - Compiled 4-quadrant emergency profile

### Care-Team Collaboration & Tracking
- `GET /api/v1/followups/patient/{id}` - Retrieve scheduled follow-ups and courses
- `POST /api/v1/collaboration/notes` - Create shared or private clinical notes
- `POST /api/v1/collaboration/notes/patient/{id}/cited-summary` - Generate cited Second Memory summary
- `GET /api/v1/metrics/corrections` - Aggregate human correction analytics (*"measured on synthetic data"*)

---

## 7. Testing & Evaluation

### Real Automated Test Results

```
============================= test session starts =============================
platform win32 -- Python 3.13.4, pytest-9.1.1
collected 84 items

tests\test_aria_integration.py ..........                                [ 11%]
tests\test_backend_foundation.py ..............                          [ 28%]
tests\test_consent_and_break_glass.py ........                           [ 38%]
tests\test_drug_safety_rules.py ........                                 [ 47%]
tests\test_extraction_security.py .......                                [ 55%]
tests\test_followups_collaboration_corrections.py ........               [ 65%]
tests\test_malicious_documents.py ........                               [ 75%]
tests\test_patient_scope.py .....                                        [ 80%]
tests\test_timeline_conflict_audit.py ....                               [ 85%]
tests\test_verification_assistant_and_emergency_summary.py .....         [ 91%]
tests\test_verification_workflow.py .......                              [100%]
======================== 84 passed in 9.11s ========================
```

```
> vericare-frontend@0.1.0 test
> vitest run

 ✓ src/test/verification-assistant.test.tsx (5 tests)
 ✓ src/test/patient-access-log.test.tsx (2 tests)
 ✓ src/test/primitives.test.tsx (11 tests)
 ✓ src/test/break-glass-review.test.tsx (2 tests)
 ✓ src/test/agent-logs.test.tsx (3 tests)
 ✓ src/test/consent-settings.test.tsx (3 tests)
 ✓ src/test/patient-pages.test.tsx (2 tests)
 ✓ src/test/followup-tracker.test.tsx (3 tests)
 ✓ src/test/aria-chat.test.tsx (4 tests)
 ✓ src/test/timeline-audit.test.tsx (4 tests)
 ✓ src/test/collaboration-workspace.test.tsx (4 tests)
 ✓ src/test/extraction-review.test.tsx (14 tests)
 ✓ src/test/verification-workflow.test.tsx (6 tests)
 ✓ src/test/emergency-summary.test.tsx (5 tests)
 ✓ src/test/safety-dashboard.test.tsx (6 tests)
 ✓ src/test/auth-shell.test.tsx (6 tests)
 ✓ src/test/correction-dashboard.test.tsx (1 test)

 Test Files  17 passed (17)
      Tests  81 passed (81)
   Duration  11.20s
```

### Metrics Summary Table
| Evaluation Domain | Metric | Real Result / Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **Backend Unit & Integration** | Test pass rate | 84 / 84 tests (100%) | **Verified** |
| **Frontend Unit & Component** | Test pass rate | 81 / 81 tests (100%) | **Verified** |
| **Combined Test Coverage** | Total automated tests | 165 tests passing | **Verified** |
| **Prompt Injection Defense** | Adversarial synthetic PDFs blocked | 8 / 8 malicious vectors blocked (100%) | **Verified** |
| **Type Safety & Build** | TypeScript compiler errors | 0 errors (`tsc && vite build`) | **Verified** |
| **Human Correction Rate** | Overall intervention rate | 11.2% (*measured on synthetic data*) | **Synthetic Benchmark** |
| **Accepted Unchanged Share** | Extraction baseline accuracy | 88.8% (*measured on synthetic data*) | **Synthetic Benchmark** |
| **Clinical Review Duration** | Average verification latency | 38.4 seconds (*measured on synthetic data*) | **Synthetic Benchmark** |
| **Clinical Production Trials** | Real-world clinical throughput | `[TO BE MEASURED]` | In Design |
| **Multi-Hospital Federation** | Live EHR FHIR inter-op latency | `[TO BE MEASURED]` | In Design |

---

## 8. Limitations & Clinical Disclaimer

1. **Synthetic Data Restriction**: VeriCare AI is evaluated exclusively against synthetic patient personas (`PAT-SYN-001`, `PAT-SYN-002`) and synthetic clinical encounter summaries. It must not be deployed to ingest real patient health records without institutional IRB review, clinical validation trials, and HIPAA / GDPR compliance certification.
2. **No Autonomous Clinical Action**: The system acts strictly as an assistive verification and safety guardrail layer. No prescription modification, allergy removal, or clinical order may take effect without an authenticated human verifier.
3. **Adherence Boundary**: Follow-up reminders and medication courses reflect scheduled calendar windows only. Clinicians must confirm actual patient compliance during clinical consultations.
4. **Mental Health Companion Notice**: Aria is an emotional wellness journal and companion prototype. It does not provide clinical therapy, medical diagnosis, or real-time psychiatric intervention.
