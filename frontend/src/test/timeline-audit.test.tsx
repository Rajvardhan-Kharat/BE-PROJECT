import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimelineAuditPage } from '../pages/TimelineAuditPage'
import { TimelineConflictResolutionModal } from '../components/timeline/TimelineConflictResolutionModal'
import { api } from '../services/api'
import type { TimelineAuditReport } from '../types/timeline_audit'

const mockReport: TimelineAuditReport = {
  patient_id: 'PAT-SYN-001',
  mrn: 'SYN-84920',
  patient_name: 'Eleanor Vance',
  total_events: 5,
  conflicts_count: 1,
  unresolved_conflicts_count: 1,
  hospitals_involved: [
    { hospital_id: 'HOSP-METRO-01', name: 'Metro Health University Medical Center' },
    { hospital_id: 'HOSP-VALLEY-02', name: 'Valley Memorial Hospital & Clinic' },
  ],
  departments_involved: ['Cardiology', 'Primary Care / Records Intake', 'Emergency Department'],
  conflicts: [
    {
      conflict_id: 'CONF-STALE-amlodipine-001',
      patient_id: 'PAT-SYN-001',
      conflict_type: 'stale_import_reintroduction',
      rule_id: 'TL-STALE-IMPORT-001',
      entity_key: 'amlodipine',
      title: 'Stale List Re-import & Status Conflict: Amlodipine',
      explanation:
        'Medication Amlodipine prescribed active at Metro Health on 2026-10-02; discontinued by specialist on 2026-10-08; then imported as active from an older chart at Valley Clinic on 2026-10-12.',
      warning:
        'DO NOT ASSUME NEWEST RECORD IS CORRECT. External chart import at Hospital B may re-introduce an intentionally discontinued medication.',
      dates: ['2026-10-02', '2026-10-08', '2026-10-12'],
      sources: [
        'Metro Health (Dr. Marcus Vance)',
        'Metro Health Specialist (Dr. Marcus Vance)',
        'Valley Memorial (Imported Chart)',
      ],
      events_involved: [
        {
          event_id: 'RX-PAT001-SCENARIO-01',
          event_type: 'prescription',
          date: '2026-10-02',
          source: 'Metro Health (Inpatient)',
          hospital_id: 'HOSP-METRO-01',
          hospital_name: 'Metro Health',
          department: 'Cardiology',
          provider_name: 'Dr. Marcus Vance',
          status: 'active',
          details: { dosage: '10 mg' },
        },
        {
          event_id: 'RX-PAT001-SCENARIO-02',
          event_type: 'prescription',
          date: '2026-10-08',
          source: 'Cardiology Specialist',
          hospital_id: 'HOSP-METRO-01',
          hospital_name: 'Metro Health',
          department: 'Cardiology',
          provider_name: 'Dr. Marcus Vance',
          status: 'discontinued',
          details: {
            dosage: '10 mg',
            discontinuation_reason: 'Discontinued due to severe bilateral peripheral edema',
          },
        },
        {
          event_id: 'RX-PAT001-SCENARIO-03',
          event_type: 'prescription',
          date: '2026-10-12',
          source: 'Valley Memorial (Chart Import)',
          hospital_id: 'HOSP-VALLEY-02',
          hospital_name: 'Valley Memorial',
          department: 'Intake',
          provider_name: 'Dr. David Miller',
          status: 'active',
          details: { dosage: '10 mg' },
        },
      ],
      status: 'unresolved',
      created_at: '2026-10-12T11:00:00Z',
      updated_at: '2026-10-12T11:00:00Z',
    },
  ],
  timeline: [
    {
      event_id: 'RX-PAT001-SCENARIO-03',
      event_type: 'prescription',
      timestamp: '2026-10-12',
      title: 'Prescription Order: Amlodipine (Medication X) (10 mg)',
      department: 'Intake / Records Import',
      hospital_id: 'HOSP-VALLEY-02',
      hospital_name: 'Valley Memorial Hospital & Clinic',
      provider_name: 'Dr. David Miller',
      status: 'active',
      has_conflict: true,
      conflict_markers: [
        {
          conflict_id: 'CONF-STALE-amlodipine-001',
          rule_id: 'TL-STALE-IMPORT-001',
          label: 'Conflict: Stale List Re-import & Status Conflict',
          type: 'stale_import_reintroduction',
          explanation: 'Imported older medication list post-discontinuation',
          warning: 'Do not assume newest import is correct.',
        },
      ],
      details: {
        notes: 'Hospital B (Valley Clinic) imported legacy medication list',
      },
    },
    {
      event_id: 'RX-PAT001-SCENARIO-02',
      event_type: 'prescription',
      timestamp: '2026-10-08',
      title: 'Prescription Order: Amlodipine (Medication X) (10 mg)',
      department: 'Cardiology',
      hospital_id: 'HOSP-METRO-01',
      hospital_name: 'Metro Health University Medical Center',
      provider_name: 'Dr. Marcus Vance (Specialist)',
      status: 'discontinued',
      has_conflict: true,
      conflict_markers: [
        {
          conflict_id: 'CONF-STALE-amlodipine-001',
          rule_id: 'TL-STALE-IMPORT-001',
          label: 'Conflict: Stale List Re-import & Status Conflict',
          type: 'stale_import_reintroduction',
          explanation: 'Specialist discontinued prior to re-import',
          warning: 'Do not assume newest import is correct.',
        },
      ],
      details: {
        discontinuation_reason: 'Refractory bilateral peripheral edema',
      },
    },
    {
      event_id: 'RX-PAT001-SCENARIO-01',
      event_type: 'prescription',
      timestamp: '2026-10-02',
      title: 'Prescription Order: Amlodipine (Medication X) (10 mg)',
      department: 'Cardiology',
      hospital_id: 'HOSP-METRO-01',
      hospital_name: 'Metro Health University Medical Center',
      provider_name: 'Dr. Marcus Vance',
      status: 'active',
      has_conflict: true,
      conflict_markers: [
        {
          conflict_id: 'CONF-STALE-amlodipine-001',
          rule_id: 'TL-STALE-IMPORT-001',
          label: 'Conflict: Stale List Re-import & Status Conflict',
          type: 'stale_import_reintroduction',
          explanation: 'Initial inpatient prescription',
          warning: 'Do not assume newest import is correct.',
        },
      ],
      details: {
        notes: 'Hospital A Inpatient order for blood pressure control',
      },
    },
  ],
}

const renderWithProviders = (initialRoute = '/patients/PAT-SYN-001/timeline') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/patients/:id/timeline" element={<TimelineAuditPage />} />
          <Route path="/timeline" element={<TimelineAuditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Timeline Conflict Audit Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'get').mockResolvedValue(mockReport)
  })

  it('renders cross-facility timeline header, invariant banner, and summary metrics', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText(/Cross-Facility Timeline Conflict Audit/i)).toBeInTheDocument()
      expect(screen.getByText(/Preserving Conflicting Records Across Healthcare Facilities/i)).toBeInTheDocument()
      expect(screen.getByText(/The newest record is NOT assumed to be correct/i)).toBeInTheDocument()
    })

    // Metrics
    expect(screen.getByText(/Chronological Events/i)).toBeInTheDocument()
    expect(screen.getByText(/Unresolved Conflicts/i)).toBeInTheDocument()
    expect(screen.getByText(/Participating Facilities/i)).toBeInTheDocument()
    expect(screen.getByText(/Active Specialties/i)).toBeInTheDocument()
  })

  it('scenario test: flags all three dates and sources without assuming newest is correct', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText(/Detected Cross-Facility Conflict Clusters/i)).toBeInTheDocument()
      expect(screen.getByText(/Conflict: TL-STALE-IMPORT-001/i)).toBeInTheDocument()
    })

    // Invariant 1: All three dates must be visible
    expect(screen.getAllByText(/2026-10-02/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2026-10-08/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2026-10-12/i).length).toBeGreaterThan(0)

    // Invariant 2: All three sources must be visible
    expect(screen.getAllByText(/Metro Health/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Valley Memorial/i).length).toBeGreaterThan(0)

    // Invariant 3: Visible warning that newest record is NOT assumed correct
    expect(screen.getByText(/DO NOT ASSUME NEWEST RECORD IS CORRECT/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Unresolved Conflict/i).length).toBeGreaterThan(0)
  })

  it('renders visible conflict markers (text + icon) on chronological timeline events', async () => {
    renderWithProviders()

    await waitFor(() => {
      const markers = screen.getAllByText(/Conflict: Stale List Re-import & Status Conflict/i)
      expect(markers.length).toBeGreaterThan(0)
    })

    // Check that all 3 events are displayed chronologically
    expect(screen.getAllByText(/Prescription Order: Amlodipine \(Medication X\)/i).length).toBe(3)
  })

  it('resolution modal allows clinician to select resolution and enforces mandatory rationale', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <TimelineConflictResolutionModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        conflict={mockReport.conflicts[0]}
      />
    )

    expect(screen.getByText(/Resolve Timeline Clinical Conflict/i)).toBeInTheDocument()
    expect(screen.getByText(/Clinical Warning: Do NOT assume newest import is correct/i)).toBeInTheDocument()

    // Confirm button is disabled when rationale is empty
    const confirmBtn = screen.getByRole('button', { name: /Confirm Resolution/i })
    expect(confirmBtn).toBeDisabled()

    // Fill valid clinical rationale
    const textarea = screen.getByPlaceholderText(/Document clinical reconciliation rationale/i)
    fireEvent.change(textarea, {
      target: {
        value: 'Attending Cardiology: Confirm specialist discontinuation on Oct 8 due to refractory edema. Archive Valley Clinic stale import.',
      },
    })
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith(
        'confirm_discontinuation',
        'Attending Cardiology: Confirm specialist discontinuation on Oct 8 due to refractory edema. Archive Valley Clinic stale import.'
      )
    })
  })
})
