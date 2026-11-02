import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FollowUpTrackerPage } from '../pages/FollowUpTrackerPage'
import { api } from '../services/api'
import type { FollowUpItem } from '../types/followup'

const mockFollowups: FollowUpItem[] = [
  {
    follow_up_id: 'FOL-SYN-001',
    patient_id: 'PAT-SYN-001',
    type: 'appointment',
    title: 'Cardiology Outpatient Follow-up',
    description: 'Post-discharge telemetry review and blood pressure assessment.',
    due_date: '2026-11-20',
    scheduled_date: '2026-11-20 10:00',
    status: 'upcoming',
    days_overdue_or_remaining: 18,
    care_team_id: 'CT-CARDIO-A',
    assigned_doctor_id: 'USR-DOC-CARDIO-001',
    adherence_inferred: false,
    clinical_safety_note: 'Deterministic schedule tracking only. Adherence is never inferred.',
    audit_history: [],
    created_at: '2026-10-18T14:30:00Z',
    updated_at: '2026-10-18T14:30:00Z',
  },
  {
    follow_up_id: 'FOL-SYN-002',
    patient_id: 'PAT-SYN-001',
    type: 'medication_course',
    title: 'Metoprolol 30-Day Titration Course',
    description: '30-day initial beta-blocker titration schedule.',
    due_date: '2026-10-25',
    status: 'overdue',
    days_overdue_or_remaining: -8,
    care_team_id: 'CT-CARDIO-A',
    assigned_doctor_id: 'USR-DOC-CARDIO-001',
    medication_details: {
      medication_name: 'Metoprolol Tartrate',
      dosage: '25 mg PO BID',
      prescribed_days: 30,
      start_date: '2026-09-25',
      expected_end_date: '2026-10-25',
    },
    adherence_inferred: false,
    clinical_safety_note: 'Deterministic schedule tracking only. Adherence is never inferred.',
    audit_history: [],
    created_at: '2026-09-25T10:00:00Z',
    updated_at: '2026-10-26T00:00:00Z',
  },
  {
    follow_up_id: 'FOL-SYN-004',
    patient_id: 'PAT-SYN-001',
    type: 'appointment',
    title: 'Post-ED Allergic Reaction Review',
    due_date: '2026-11-01',
    completed_date: '2026-11-01',
    status: 'completed',
    days_overdue_or_remaining: -1,
    adherence_inferred: false,
    clinical_safety_note: 'Deterministic schedule tracking only. Adherence is never inferred.',
    audit_history: [],
    created_at: '2026-10-30T05:00:00Z',
    updated_at: '2026-11-01T11:30:00Z',
  },
]

describe('FollowUpTrackerPage Test Suite', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  it('renders page header, mandatory clinical safety banner, and KPI summary', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: mockFollowups })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/follow-ups']}>
          <Routes>
            <Route path="/patients/:id/follow-ups" element={<FollowUpTrackerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Header & Tag
    expect(screen.getByText('Follow-Up & Medication-Course Tracker')).toBeInTheDocument()
    expect(screen.getByText('Agent 5 Deterministic')).toBeInTheDocument()

    // Mandatory Clinical Guardrail
    expect(screen.getByText(/Clinical Safety Mandate: Adherence is Never Inferred/i)).toBeInTheDocument()

    // Table rows
    await waitFor(() => {
      expect(screen.getByText('Cardiology Outpatient Follow-up')).toBeInTheDocument()
      expect(screen.getByText('Metoprolol 30-Day Titration Course')).toBeInTheDocument()
      expect(screen.getByText('Post-ED Allergic Reaction Review')).toBeInTheDocument()
    })

    // Status badges
    expect(screen.getAllByText(/Upcoming/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Overdue/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Completed/i).length).toBeGreaterThanOrEqual(1)
  })

  it('allows opening status transition modal and validates mandatory rationale', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: mockFollowups })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({
      data: { ...mockFollowups[0], status: 'completed' },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/follow-ups']}>
          <Routes>
            <Route path="/patients/:id/follow-ups" element={<FollowUpTrackerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Cardiology Outpatient Follow-up')).toBeInTheDocument()
    })

    // Click "Complete" on first item
    const completeBtn = screen.getByTestId('action-complete-FOL-SYN-001')
    fireEvent.click(completeBtn)

    // Modal opens
    expect(screen.getByText(/Update Schedule Status:/i)).toBeInTheDocument()
    expect(screen.getByText(/Clinical Rationale \/ Decision Note/i)).toBeInTheDocument()

    // Try submitting without rationale
    const confirmBtn = screen.getByRole('button', { name: /Confirm Transition/i })
    fireEvent.click(confirmBtn)

    // Enter rationale and submit
    const textarea = screen.getByPlaceholderText(/Mandatory clinical explanation/i)
    fireEvent.change(textarea, { target: { value: 'Inpatient cardiology telemetry review verified.' } })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        '/followups/FOL-SYN-001/status',
        expect.objectContaining({
          status: 'completed',
          reason: 'Inpatient cardiology telemetry review verified.',
        })
      )
    })
  })

  it('runs Agent 5 evaluation when clicking schedule check button', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: mockFollowups })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        patient_id: 'PAT-SYN-001',
        total_tracked: 3,
        adherence_inferred: false,
        summary: 'Evaluated 3 items. Adherence is never inferred.',
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/follow-ups']}>
          <Routes>
            <Route path="/patients/:id/follow-ups" element={<FollowUpTrackerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    const checkBtn = screen.getByRole('button', { name: /Run Deterministic Schedule Check/i })
    fireEvent.click(checkBtn)

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/followups/patient/PAT-SYN-001/evaluate')
    })
  })
})
