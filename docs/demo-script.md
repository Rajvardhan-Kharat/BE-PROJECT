# VeriCare AI: 10-Minute Clinical Demonstration Script

This document provides a structured, live 10-minute walkthrough of **VeriCare AI** for clinicians, security officers, and clinical governance auditors. All data is synthetic and demonstrations run entirely in local sandbox mode.

---

## Prerequisites & Environment Setup

Run the master initialization command:
```powershell
# PowerShell
python scripts/seed.py
```
```bash
# Linux / macOS
python scripts/seed.py
```

Start the services:
- **Backend**: `uvicorn backend.app.main:app --reload --port 8000`
- **Frontend**: `npm --prefix frontend run dev` (Available at `http://localhost:5173`)

### Pre-Seeded Demonstration Accounts (Password: `synthetic-dev-password`)
| Role | Email | User ID | Scope |
| :--- | :--- | :--- | :--- |
| **Senior Doctor (Verifier)** | `dr.lin@vericare.local` | `USR-VERIFIER-001` | Metro Health (Internal Medicine) |
| **Cardiologist (Doctor)** | `dr.marcus@vericare.local` | `USR-DOC-CARDIO-001` | Metro Health (Cardiology) |
| **Attending Doctor** | `dr.chen@vericare.local` | `USR-DOC-METRO-001` | Metro Health (Ward A) |
| **Patient** | `eleanor.vance@synthetic.local` | `PAT-SYN-001` | Eleanor Vance (MRN: `SYN-84920`) |
| **Hospital Admin** | `admin.metro@vericare.local` | `USR-ADMIN-001` | Metro Health Governance |
| **System Admin** | `system.admin@vericare.local` | `USR-SYS-001` | Global Audit & Adapters |

---

## 10-Minute Walkthrough Flow

```
[00:00] Shell & Security Invariants ───► [01:00] Document Ingestion & Offsets
                                                     │
[03:00] Deterministic Drug Safety   ◄─── [02:00] Verification & Append-Only Log
        │
        ▼
[04:00] Cross-Hospital Timeline     ───► [05:00] Emergency Profile (Agent 4)
                                                     │
[07:00] Second Memory Collaboration ◄─── [06:00] Follow-Up Tracker (Agent 5)
        │
        ▼
[08:00] Consent & Break-Glass       ───► [09:00] Aria & Human Correction Metrics
```

---

### Minute 0:00 - 01:00: Clinical Shell, Patient Context & Default-Deny RBAC
1. **Navigate to `http://localhost:5173/login`** and sign in as **`dr.lin@vericare.local`**.
2. **Highlight the Persistent Clinical Shell**:
   - **Prototype Banner**: Persistent top strip confirming synthetic demonstration mode.
   - **Active Patient Strip**: Eleanor Vance (MRN: `SYN-84920`, 58y F, Allergies: Penicillin, Sulfa).
   - **Default-Deny Policy**: Visible role and care team scope indicators.
3. **Point out the Role Switcher**: Instant switching between Doctor, Verifier, Patient, and Admin without re-entering credentials during evaluations.

---

### Minute 01:00 - 02:00: Untrusted Document Extraction & Span Grounding (Agent 1)
1. **Navigate to Extraction Review**: `/documents/DOC-SYN-84920-01/review`.
2. **Demonstrate Grounded Offsets**:
   - Left pane displays raw clinical discharge document.
   - Right pane displays structured extracted fields (`medication_name`, `dosage`, `frequency`, `allergy`).
   - Click **`Metoprolol Tartrate`**: notice the exact document span highlights on the left document viewer.
3. **Security Invariant**:
   - Point out that untrusted PDF extractions are saved strictly in `untrusted_documents` as `pending_review`.
   - The AI ingestion engine has **zero write path** to the approved clinical collections.
4. **Human Correction**:
   - Click **Edit Value** on `dosage` (25 mg PO BID).
   - Show human correction modal requiring original value, corrected value, and clinical rationale.

---

### Minute 02:00 - 03:00: Clinical Verification & Append-Only Record Versions
1. **Navigate to Verification Queue**: `/verification`.
2. **Review Proposed Record**:
   - Open comparison screen for Eleanor Vance's discharge medications.
   - View 3-way comparative view: source document snippet, currently approved version (v1), and proposed version (v2).
3. **Separation of Duty Rule**:
   - Notice that if the submitter attempts to self-approve, the action is disabled and audited.
4. **Approve Version**:
   - Click **Approve Proposal**. Old version is atomically marked `superseded`, and new version is committed to trusted `record_versions`. Old imports can never overwrite newer verified data.

---

### Minute 03:00 - 04:00: Deterministic Clinical Safety & Drug Interaction Engine
1. **Navigate to Medication Safety**: `/safety`.
2. **Deterministic Rules (No LLM Hallucinations)**:
   - Click **Run Safety Checks**.
   - Show detected alerts:
     - **Drug-Drug Interaction**: `RULE-DDI-001` (Warfarin + Aspirin interaction - heightened bleeding risk).
     - **Allergy Conflict**: `RULE-ALG-001` (Penicillin allergy alert against prescribed beta-lactam).
     - **Duplicate Active Orders**: Contradictory ACE-inhibitor doses.
3. **Audited Resolution**:
   - Click **Dismiss Alert** or **Resolve**.
   - Show that clinical rationale is strictly required; unreasoned dismissals are rejected by backend schema.

---

### Minute 04:00 - 05:00: Cross-Hospital Timeline Conflict Audit
1. **Navigate to Timeline Audit**: `/timeline`.
2. **Multi-Hospital Scenario**:
   - Observe Eleanor Vance's medication journey across **Metro Health** and **Valley Memorial**.
   - **Chronology**:
     - *Oct 02*: Metro Health prescribes Medication X.
     - *Oct 08*: Cardiology specialist explicitly discontinues Medication X due to intolerance.
     - *Oct 12*: Valley Memorial imports old medication list showing Medication X as active.
3. **Core Governance Rule**:
   - VeriCare AI **does NOT assume the newest timestamp is correct**.
   - Flags contradictory active status across all 3 institutions with hairline conflict badges.

---

### Minute 05:00 - 06:00: Emergency Profile & Verification Assistant (Agent 4 & Agent 3)
1. **Navigate to Emergency Summary**: `/emergency-summary`.
2. **Four Segregated Clinical Quadrants**:
   - **Verified**: Only approved, trusted records appear here.
   - **Pending**: Unreviewed AI extractions clearly segregated.
   - **Conflicting**: Active multi-hospital contradictions.
   - **Missing / Stale**: Incomplete labs or outdated documentation.
3. **Critical Medical Safety Guarantee**:
   - Empty allergy lists **NEVER** display "No Allergies" or "None".
   - The system displays explicit phrasing: **"Allergy information unavailable"**.

---

### Minute 06:00 - 07:00: Follow-Up & Course Tracking (Agent 5)
1. **Navigate to Follow-Up Tracker**: `/follow-ups`.
2. **Deterministic Tracking**:
   - View scheduled follow-up appointments, medication courses, and repeat BMP lab orders.
   - Statuses: `upcoming`, `overdue`, `completed`, `deferred`, `needs_review`.
3. **Mandatory Clinical Safety Notice**:
   - Note the persistent banner: **Adherence is Never Inferred**.
   - System evaluates pure calendar deltas without assuming patient compliance.
4. **Status Transition**:
   - Click **Complete** or **Defer** on a follow-up item. Modal requires mandatory clinical rationale.

---

### Minute 07:00 - 08:00: Second Memory & Care-Team Collaboration
1. **Navigate to Care-Team Workspace**: `/workspace`.
2. **Search & Tag Filters**:
   - Filter notes by `#Cardiology`, `#Titration`, or search keywords.
3. **Cited Clinical Summary**:
   - Click **Cited Summary** -> **Generate Cited Summary**.
   - View structured brief citing exact record IDs, author names, specialties, and verbatim quotes.
4. **Private Clinician Scratchpad Isolation**:
   - Look at note titled *"Private Clinician Impression: Renal Trend Concerns"*.
   - Badge confirms `Private (Author Only)`.
   - Unauthorized clinicians attempting to view private notes receive an audited `403 Forbidden`.

---

### Minute 08:00 - 09:00: Patient Consent & Emergency Break-Glass Override
1. **Switch Role to Patient** (`eleanor.vance@synthetic.local`).
2. **Consent Directives**:
   - Navigate to `/consent`.
   - View active directives. Click **Revoke Consent** for Valley Memorial.
   - Backend immediately blocks data sharing on all subsequent reads.
3. **Patient Access Log**:
   - Navigate to `/access-log` to see real-time immutable audit of every doctor who accessed the file.
4. **Emergency Break-Glass Demonstration**:
   - Switch role to non-care-team clinician and navigate to `/patients/PAT-SYN-001/break-glass`.
   - Submit emergency override: requires mandatory clinical justification (`category: cardiac_arrest`).
   - Grants temporary 60-minute scoped emergency profile.
   - Immediately alerts patient and logs high-priority audit event.
5. **Hospital Admin Audit**:
   - Switch role to **Hospital Admin** -> `/admin/break-glass`.
   - Review active override and mark determination as `justified`.

---

### Minute 09:00 - 10:00: Aria Private Companion & Human Correction Analytics
1. **Switch Role to Patient** -> Navigate to `/aria`.
2. **Private Emotional Journal**:
   - Observe pseudonymous server routing (patient name/MRN never sent).
   - Enter standard reflection: receive supportive canned mock response.
3. **Crisis Guardrail Trigger**:
   - Enter simulated self-harm statement.
   - Notice immediate local safety gate trigger: provider call is aborted, compassionate response with 24/7 verified helplines appears.
4. **Curated Snapshot Sharing**:
   - Navigate to `/aria/sharing`.
   - Draft summary -> patient edits text directly -> clicks **Approve & Share Snapshot**.
   - Care team receives only what the patient explicitly approved.
5. **Human Correction Analytics**:
   - Navigate to `/corrections`.
   - Review overall human correction rate (11.2%), field-type breakdown, and average review duration (38.4s).
   - Notice prominent academic label: **`measured on synthetic data`**.

---

## Conclusion & Wrap-Up
- All 14 system capabilities verified.
- 100% deterministic safety rules and audited clinical governance.
- Strict isolation between untrusted AI drafts and approved clinical records.
