import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerificationAssistantPanel } from '../components/verification/VerificationAssistantPanel'
import type { VerificationAssistantResponse } from '../types/verification_assistant'

const mockAssistantData: VerificationAssistantResponse = {
  version_id: 'VER-20261024-002',
  record_id: 'REC-PAT001-CARDIO-02',
  patient_id: 'PAT-SYN-001',
  missing_fields: ['dose_frequency', 'indication'],
  uncertain_fields: ['titration_interval'],
  conflicts_with_prior: [
    {
      conflict_id: 'PRIOR-CONF-001',
      field_name: 'dosage',
      prior_record_id: 'REC-PAT001-CARDIO-01',
      prior_value: '25 mg PO BID',
      proposed_value: '50 mg PO BID',
      explanation: 'Dose escalated without documented cardiology note titration protocol.',
    },
  ],
  old_vs_proposed_values: [
    {
      field_name: 'dosage',
      old_value: '25 mg PO BID',
      proposed_value: '50 mg PO BID',
      is_changed: true,
      is_new: false,
    },
    {
      field_name: 'medication_name',
      old_value: 'Metoprolol Tartrate',
      proposed_value: 'Metoprolol Tartrate',
      is_changed: false,
      is_new: false,
    },
  ],
  evidence: [
    {
      field_name: 'dosage',
      doc_id: 'DOC-SYN-84920-01',
      page: 1,
      quote: 'Increase metoprolol tartrate to 50 mg BID for rate control',
      confidence_note: 'Verified OCR span match',
    },
  ],
  reviewer_summary:
    'Clinical proposal modifies active prescription dosage from 25 mg PO BID to 50 mg PO BID.',
  suggestion: 'requires_correction',
  suggestion_rationale:
    'Required clinical field dose_frequency is missing and prior dose change requires explicit clinician sign-off.',
  disclaimer: 'Suggestion only. Backend enforces, human verifier decides.',
  agent_run_id: 'RUN-ASSISTANT-20261102-001',
}

describe('VerificationAssistantPanel', () => {
  it('renders advisory disclaimer and suggestion chip with correct status', () => {
    render(
      <VerificationAssistantPanel
        data={mockAssistantData}
        isLoading={false}
        isError={false}
      />
    )

    expect(screen.getByText('Verification Assistant')).toBeInTheDocument()
    expect(screen.getByText('REQUIRES_CORRECTION')).toBeInTheDocument()
    expect(screen.getByText('Suggestion only. Backend enforces, human verifier decides.')).toBeInTheDocument()
    expect(screen.getByText(/RUN-ASSISTANT-20261102-001/)).toBeInTheDocument()
  })

  it('renders reviewer summary and rationale', () => {
    render(
      <VerificationAssistantPanel
        data={mockAssistantData}
        isLoading={false}
        isError={false}
      />
    )

    expect(
      screen.getByText(/Clinical proposal modifies active prescription dosage/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Required clinical field dose_frequency is missing/i)
    ).toBeInTheDocument()
  })

  it('renders missing and uncertain fields badges', () => {
    render(
      <VerificationAssistantPanel
        data={mockAssistantData}
        isLoading={false}
        isError={false}
      />
    )

    expect(screen.getByText('dose_frequency')).toBeInTheDocument()
    expect(screen.getByText('indication')).toBeInTheDocument()
    expect(screen.getByText('titration_interval')).toBeInTheDocument()
  })

  it('renders conflicts with prior records and field diff table', () => {
    render(
      <VerificationAssistantPanel
        data={mockAssistantData}
        isLoading={false}
        isError={false}
      />
    )

    expect(screen.getByText(/Prior Record Conflicts \(1\)/i)).toBeInTheDocument()
    expect(screen.getAllByText('25 mg PO BID').length).toBeGreaterThan(0)
    expect(screen.getAllByText('50 mg PO BID').length).toBeGreaterThan(0)
    expect(screen.getByText('Changed')).toBeInTheDocument()
    expect(screen.getByText('Unchanged')).toBeInTheDocument()
  })

  it('renders verified OCR quote span', () => {
    render(
      <VerificationAssistantPanel
        data={mockAssistantData}
        isLoading={false}
        isError={false}
      />
    )

    expect(
      screen.getByText(/"Increase metoprolol tartrate to 50 mg BID for rate control"/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Doc: DOC-SYN-84920-01 • Page 1/i)).toBeInTheDocument()
  })
})
