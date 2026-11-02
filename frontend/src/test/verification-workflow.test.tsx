import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VerificationQueuePage } from '../pages/VerificationQueuePage'
import { RecordComparisonPage } from '../pages/RecordComparisonPage'
import { VerificationDecisionModal } from '../components/verification/VerificationDecisionModal'
import { AuthProvider } from '../context/AuthContext'
import { api } from '../services/api'
import type { VerificationQueueItem, RecordComparisonResponse } from '../types/verification'

const mockQueue: VerificationQueueItem[] = [
  {
    version_id: 'VER-20261024-002',
    record_id: 'REC-PAT001-CARDIO-02',
    patient_id: 'PAT-SYN-001',
    patient_name: 'Eleanor Vance',
    mrn: 'SYN-84920',
    version_number: 1,
    status: 'pending_review',
    record_type: 'medication_reconciliation',
    title: 'Aria AI Proposal: Beta-Blocker Dose Titration',
    department: 'Cardiology',
    hospital_id: 'HOSP-METRO-01',
    hospital_name: 'Metro Health University Medical Center',
    submitter_name: 'Dr. Marcus Vance',
    submitted_by: 'USR-DOC-CARDIO-001',
    submitted_at: '2026-10-24T11:45:00Z',
    fields_count: 1,
    has_prior_approved: true,
  },
  {
    version_id: 'VER-20261028-003',
    record_id: 'REC-PAT001-ONCO-01',
    patient_id: 'PAT-SYN-001',
    patient_name: 'Eleanor Vance',
    mrn: 'SYN-84920',
    version_number: 1,
    status: 'requires_correction',
    record_type: 'clinical_note',
    title: 'Oncology Baseline Screening Extract',
    department: 'Oncology',
    hospital_id: 'HOSP-METRO-01',
    hospital_name: 'Metro Health University Medical Center',
    submitter_name: 'Dr. Elena Rostova',
    submitted_by: 'USR-DOC-ONCO-002',
    submitted_at: '2026-10-28T09:30:00Z',
    review_reason: 'Provisional ICD code C79.9 inappropriate prior to histology report.',
    fields_count: 0,
    has_prior_approved: false,
  },
]

const mockComparison: RecordComparisonResponse = {
  proposed_version: {
    version_id: 'VER-20261024-002',
    record_id: 'REC-PAT001-CARDIO-02',
    patient_id: 'PAT-SYN-001',
    version_number: 1,
    status: 'pending_review',
    record_type: 'medication_reconciliation',
    title: 'Aria AI Proposal: Beta-Blocker Dose Titration',
    department: 'Cardiology',
    hospital_id: 'HOSP-METRO-01',
    data: {
      proposed_medication: 'Metoprolol Tartrate 50 mg PO BID',
      clinical_indication: 'Resting pulse 92 bpm at follow-up',
    },
    source_document_id: 'DOC-SYN-84920-01',
    source_text_snippet: 'Outpatient Follow-up: Resting heart rate remains 92 bpm. Plan: Increase Metoprolol to 50mg BID.',
    extracted_fields: [
      {
        field_name: 'proposed_medication',
        value: 'Metoprolol Tartrate 50 mg PO BID',
        status: 'inferred',
      },
    ],
    submitted_by: 'USR-DOC-CARDIO-001',
    submitter_name: 'Dr. Marcus Vance',
    submitted_at: '2026-10-24T11:45:00Z',
    created_at: '2026-10-24T11:45:00Z',
  },
  current_approved_version: {
    version_id: 'VER-20261018-001',
    record_id: 'REC-PAT001-CARDIO-01',
    patient_id: 'PAT-SYN-001',
    version_number: 1,
    status: 'approved',
    record_type: 'discharge_summary',
    title: 'Discharge Summary - Paroxysmal Atrial Fibrillation',
    department: 'Cardiology',
    hospital_id: 'HOSP-METRO-01',
    data: {
      proposed_medication: 'Metoprolol Tartrate 25 mg PO BID',
      clinical_indication: 'Rate control for paroxysmal AFib',
    },
    extracted_fields: [],
    submitted_by: 'USR-DOC-CARDIO-001',
    submitter_name: 'Dr. Marcus Vance',
    submitted_at: '2026-10-18T14:00:00Z',
    reviewed_by: 'USR-VERIFIER-001',
    reviewer_name: 'Dr. Sarah Lin',
    reviewed_at: '2026-10-18T15:30:00Z',
    review_decision: 'approved',
    created_at: '2026-10-18T14:00:00Z',
  },
  patient_name: 'Eleanor Vance',
  mrn: 'SYN-84920',
  hospital_name: 'Metro Health University Medical Center',
  field_diffs: [
    {
      field: 'proposed_medication',
      current_val: 'Metoprolol Tartrate 25 mg PO BID',
      proposed_val: 'Metoprolol Tartrate 50 mg PO BID',
      change_type: 'modified',
    },
    {
      field: 'clinical_indication',
      current_val: 'Rate control for paroxysmal AFib',
      proposed_val: 'Resting pulse 92 bpm at follow-up',
      change_type: 'modified',
    },
  ],
  can_current_user_approve: false,
  restriction_reason: 'Submitter cannot approve their own submission (dual-authorization policy).',
}

function renderWithProviders(ui: React.ReactElement, initialRoute = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('VerificationQueuePage', () => {
  it('renders pending verification proposals and correction requests', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockQueue)

    renderWithProviders(<VerificationQueuePage />)

    await waitFor(() => {
      expect(screen.getByText('Clinical Verification Queue')).toBeInTheDocument()
      expect(screen.getByText('Aria AI Proposal: Beta-Blocker Dose Titration')).toBeInTheDocument()
      expect(screen.getByText('Oncology Baseline Screening Extract')).toBeInTheDocument()
      expect(screen.getAllByText('Eleanor Vance').length).toBeGreaterThan(0)
    })
  })
})

describe('RecordComparisonPage', () => {
  it('renders source evidence beside proposed extraction and shows current vs proposed diff', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockComparison)

    renderWithProviders(
      <Routes>
        <Route path="/verification/:versionId/compare" element={<RecordComparisonPage />} />
      </Routes>,
      '/verification/VER-20261024-002/compare'
    )

    await waitFor(() => {
      expect(screen.getByText('Clinical Source Evidence')).toBeInTheDocument()
      expect(screen.getByText(/Outpatient Follow-up: Resting heart rate remains 92 bpm/i)).toBeInTheDocument()
      expect(screen.getByText(/Comparative Diff: Current Approved vs Proposed/i)).toBeInTheDocument()
      expect(screen.getByText('Metoprolol Tartrate 25 mg PO BID')).toBeInTheDocument()
      expect(screen.getByText('Metoprolol Tartrate 50 mg PO BID')).toBeInTheDocument()
    })
  })

  it('displays governance restriction warning when self-approval or unauthorized', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockComparison)

    renderWithProviders(
      <Routes>
        <Route path="/verification/:versionId/compare" element={<RecordComparisonPage />} />
      </Routes>,
      '/verification/VER-20261024-002/compare'
    )

    await waitFor(() => {
      expect(screen.getByText(/Review Actions Restricted/i)).toBeInTheDocument()
      expect(screen.getByText(/Submitter cannot approve their own submission/i)).toBeInTheDocument()
    })
  })
})

describe('VerificationDecisionModal', () => {
  it('enforces mandatory clinical reason when rejecting', () => {
    const onConfirm = vi.fn()
    render(
      <VerificationDecisionModal
        isOpen={true}
        onClose={vi.fn()}
        decision="rejected"
        recordTitle="Beta-Blocker Dose Titration"
        versionNumber={1}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Reject Untrusted Proposal')).toBeInTheDocument()

    // Try to confirm without typing reason
    const confirmBtn = screen.getByRole('button', { name: /confirm rejection/i })
    fireEvent.click(confirmBtn)

    // Should show validation error and NOT call onConfirm
    expect(screen.getByText(/A detailed clinical reason .* is mandatory/i)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    // Type a valid clinical reason
    const textarea = screen.getByPlaceholderText(/Specify precise clinical reason for rejection/i)
    fireEvent.change(textarea, {
      target: { value: 'Incompatible with patient resting bradycardia during sleep.' },
    })
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith('Incompatible with patient resting bradycardia during sleep.')
  })

  it('enforces mandatory clinical reason when requesting correction', () => {
    const onConfirm = vi.fn()
    render(
      <VerificationDecisionModal
        isOpen={true}
        onClose={vi.fn()}
        decision="requires_correction"
        recordTitle="Beta-Blocker Dose Titration"
        versionNumber={1}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Request Clinical Correction')).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /submit correction request/i })
    fireEvent.click(confirmBtn)

    expect(screen.getByText(/A detailed clinical reason .* is mandatory/i)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    const textarea = screen.getByPlaceholderText(/Detail required corrections for clinician author/i)
    fireEvent.change(textarea, {
      target: { value: 'Dosage ambiguous, please specify whether once daily or twice daily.' },
    })
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith('Dosage ambiguous, please specify whether once daily or twice daily.')
  })

  it('allows approval without mandatory reason and indicates append-only commit', () => {
    const onConfirm = vi.fn()
    render(
      <VerificationDecisionModal
        isOpen={true}
        onClose={vi.fn()}
        decision="approved"
        recordTitle="Beta-Blocker Dose Titration"
        versionNumber={1}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Approve & Commit Clinical Record')).toBeInTheDocument()
    expect(screen.getByText(/creates a new immutable version in the trusted clinical collection/i)).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /confirm approval/i })
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith('')
  })
})
