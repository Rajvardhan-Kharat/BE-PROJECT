import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmergencySummaryPage } from '../pages/EmergencySummaryPage'
import { api } from '../services/api'
import type { EmergencySummaryResponse } from '../types/emergency_summary'

const mockEmergencyData: EmergencySummaryResponse = {
  patient_id: 'PAT-SYN-001',
  mrn: 'SYN-84920',
  patient_name: 'Eleanor Vance',
  date_of_birth: '1974-06-12',
  gender: 'female',
  blood_type: 'A+',
  last_updated_time: '2026-10-24T14:00:00Z',
  compiled_at: '2026-11-02T19:30:00Z',
  verified: [
    {
      category: 'active_medications',
      label: 'Metoprolol Succinate',
      details: '50 mg once daily oral',
      source_record_id: 'REC-PAT001-CARDIO-01',
      source_version_id: 'VER-PAT001-01',
      hospital_name: 'Metro Health University Medical Center',
      reviewed_by: 'Dr. Marcus Vance (Senior Cardiologist)',
      reviewed_at: '2026-10-20T10:00:00Z',
    },
  ],
  pending: [
    {
      category: 'active_medications',
      label: 'Atorvastatin (Proposed Dose Escalation)',
      proposed_value: '40 mg oral nightly',
      source_version_id: 'VER-PENDING-PROP-099',
      submitted_by: 'Dr. Sarah Lin',
      submitted_at: '2026-10-24T11:45:00Z',
      status: 'pending_review',
      quarantine_warning:
        'QUARANTINED: Unreviewed proposal — NOT approved for acute clinical decision-making.',
    },
  ],
  conflicting: [
    {
      conflict_id: 'CONF-AMLODIPINE-001',
      entity: 'Amlodipine',
      conflict_type: 'cross_facility_status_conflict',
      explanation:
        'Discontinued by Metro Health specialist Oct 8; reintroduced as active by Valley Memorial Oct 12.',
      sources_involved: ['Metro Health', 'Valley Memorial'],
      warning:
        'CROSS-FACILITY CONFLICT: Clinical discrepancy detected across hospital records.',
    },
  ],
  missing_or_stale: [
    {
      category: 'allergies',
      item_name: 'Documented Drug Allergies',
      status_display: 'Allergy information unavailable',
      notes:
        'Absence of recorded allergies must NOT be assumed as "No Known Allergies" (NKDA). Clinical history unavailable.',
      last_known_date: null,
    },
    {
      category: 'vitals',
      item_name: 'Inpatient Blood Pressure',
      status_display: 'Stale (> 48 hours)',
      notes: 'Last documented vitals taken on 2026-10-20.',
      last_known_date: '2026-10-20',
    },
  ],
  agent_run_id: 'RUN-EMERGENCY-20261102-001',
}

function renderEmergencyPage(patientId = 'PAT-SYN-001') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/patients/${patientId}/emergency-summary`]}>
        <Routes>
          <Route path="/patients/:id/emergency-summary" element={<EmergencySummaryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('EmergencySummaryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all four clinical sections: Verified, Pending, Conflicting, Missing or Stale', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockEmergencyData)

    renderEmergencyPage()

    await waitFor(() => {
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
    })

    // Header demographic checks
    expect(screen.getByText(/MRN: SYN-84920/)).toBeInTheDocument()
    expect(screen.getByText('A+')).toBeInTheDocument()

    // 4 sections must be clearly titled
    expect(screen.getByText(/Verified Clinical Data/i)).toBeInTheDocument()
    expect(screen.getByText(/Pending Review \(Quarantined\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Conflicting Records/i)).toBeInTheDocument()
    expect(screen.getByText(/Missing or Stale Information/i)).toBeInTheDocument()
  })

  it('guarantees pending items NEVER leak into the Verified Clinical Data section', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockEmergencyData)

    renderEmergencyPage()

    await waitFor(() => {
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
    })

    // Check Verified section items
    expect(screen.getByText('Metoprolol Succinate')).toBeInTheDocument()
    expect(screen.getByText('REC-PAT001-CARDIO-01')).toBeInTheDocument()

    // Check Pending quarantined item
    expect(
      screen.getByText('Atorvastatin (Proposed Dose Escalation)')
    ).toBeInTheDocument()
    expect(
      screen.getByText(/QUARANTINED: Unreviewed proposal — NOT approved for acute clinical decision-making/i)
    ).toBeInTheDocument()

    // Verified section should NOT contain the quarantined Atorvastatin
    const verifiedSection = screen.getByText(/Verified Clinical Data/i).closest('section')
    expect(verifiedSection).toBeInTheDocument()
    expect(verifiedSection).not.toHaveTextContent('Atorvastatin')
    expect(verifiedSection).toHaveTextContent('Metoprolol Succinate')
  })

  it('displays "Allergy information unavailable" and NEVER "No known allergies" / "NKDA"', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockEmergencyData)

    renderEmergencyPage()

    await waitFor(() => {
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
    })

    // Mandatory clinical governance requirement: missing is not negative
    expect(screen.getByText('Allergy information unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Absence of recorded allergies must NOT be assumed as "No Known Allergies"/i)).toBeInTheDocument()

    // Confirm neither "No Known Allergies" nor "NKDA" is rendered anywhere as a factual state
    expect(screen.queryByText(/^No Known Allergies$/i)).toBeNull()
    expect(screen.queryByText(/^NKDA$/i)).toBeNull()
  })

  it('renders cross-facility conflict with active warning and sources', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockEmergencyData)

    renderEmergencyPage()

    await waitFor(() => {
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
    })

    expect(screen.getByText('Amlodipine')).toBeInTheDocument()
    expect(
      screen.getByText(/Discontinued by Metro Health specialist Oct 8; reintroduced as active by Valley Memorial Oct 12/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/CROSS-FACILITY CONFLICT: Clinical discrepancy detected across hospital records/i)
    ).toBeInTheDocument()
  })

  it('allows filtering by individual section tabs', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockEmergencyData)

    renderEmergencyPage()

    await waitFor(() => {
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
    })

    // Click "Pending" tab only
    const pendingTab = screen.getByRole('button', { name: /Pending \(1\)/i })
    fireEvent.click(pendingTab)

    expect(screen.getByText(/Pending Review \(Quarantined\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/Verified Clinical Data/i)).toBeNull()
    expect(screen.queryByText(/Conflicting Records/i)).toBeNull()
  })
})
