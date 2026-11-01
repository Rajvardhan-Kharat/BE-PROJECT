# VeriCare AI - Project Context

## 1. Project One-Liner
VeriCare AI: Academic prototype clinical governance and verification platform operating strictly on synthetic data.

## 2. Tech Stack
- **Backend**: FastAPI, Pydantic, MongoDB (Motor async driver)
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, TanStack Query
- **Testing**: pytest (backend), Vitest (frontend)

## 3. Core Architectural & Safety Rules
- **Authority**: AI proposes / backend enforces / humans decide.
- **Data Boundaries**: AI never writes directly to trusted collections.
- **Clinical Logic**: Missing data is NOT negative data; conflicts are preserved and never auto-resolved.
- **Input Integrity**: Uploaded clinical documents are untrusted data.
- **Transparency**: Every mock is explicitly labeled.
- **Verification**: Never claim anything works unless actually run and verified.

## 4. Roles & Access Control
- **Roles**:
  - `patient`
  - `doctor`
  - `senior_doctor` (verifier)
  - `hospital_admin`
  - `system_admin`
- **Permission Check Formula**: `Role + Scope (Care Team) + Consent/State`
- **Security Policy**: Default deny; every access denial is strictly audited.

## 5. Record Statuses
- `draft`
- `pending_review`
- `approved`
- `rejected`
- `superseded`
- `requires_correction`

## 6. Folder Structure
```
VeriCare/
├── backend/
│   └── app/
│       ├── api/
│       ├── core/
│       ├── models/
│       ├── schemas/
│       ├── repositories/
│       ├── services/
│       ├── agents/
│       ├── ai/
│       ├── safety/
│       └── permissions/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── hooks/
│       ├── types/
│       └── utils/
├── synthetic_data/
└── docs/
```

## 7. Aria Integration
- **Status**: ALREADY BUILT as an independent separate service.
- **Integration Boundary**: VeriCare integrates strictly through an adapter client.
- **Rule**: Do NOT rebuild, retrain, or replicate Aria internally.

## 8. Working Rules
- Touch only files required for the immediate task.
- Run tests before finishing any implementation.
- Keep final reports short and actionable.
- Create a clean git commit per prompt/feature.
