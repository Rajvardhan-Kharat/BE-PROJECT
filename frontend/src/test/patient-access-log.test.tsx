import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PatientAccessLogPage } from '../pages/PatientAccessLogPage'
import { api } from '../services/api'
import type { PatientAccessLogResponse } from '../types/access_log'

const mockAccessData: PatientAccessLogResponse = {
  patient_id: 'PAT-SYN-001',
  total_accesses: 3,
  break_glass_accesses_count: 1,
  entries: [
    {
      log_id: 'AUD-EVT-001',
      timestamp: '2026-11-02T19:00:00Z',
      accessor_id: 'USR-DOC-PULMO-001',
      accessor_name: 'Dr. Emily Watson (Pulmonology)',
      accessor_role: 'doctor',
      access_type: 'break_glass_emergency',
      resource_accessed: 'emergency_summary_and_active_meds',
      break_glass_reason_category: 'acute_respiratory_distress',
      break_glass_justification: 'Acute trauma and severe respiratory failure requiring immediate medication history check.',
      status: 'active',
    },
    {
      log_id: 'AUD-EVT-002',
      timestamp: '2026-11-02T18:45:00Z',
      accessor_id: 'USR-DOC-CARDIO-001',
      accessor_name: 'Dr. Sarah Lin (Cardiology)',
      accessor_role: 'doctor',
      access_type: 'standard',
      resource_accessed: 'patient_overview',
      purpose: 'Care team follow-up',
      status: 'SUCCESS',
    },
    {
      log_id: 'AUD-EVT-003',
      timestamp: '2026-11-02T18:30:00Z',
      accessor_id: 'USR-DOC-ORTHO-001',
      accessor_name: 'Dr. Mark Sloan',
      accessor_role: 'doctor',
      access_type: 'access_denied',
      resource_accessed: 'patient_overview',
      purpose: 'Unassigned access',
      status: 'DENIED',
    },
  ],
}

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      userId: 'PAT-SYN-001',
      name: 'Eleanor Vance',
      email: 'eleanor.vance@synthetic.vericare.internal',
      role: 'patient',
    },
  }),
}))

describe('PatientAccessLogPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    ;(api.get as any).mockResolvedValue(mockAccessData)
  })

  it('renders patient access log with highlighted break-glass emergency override', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/access-log']}>
          <Routes>
            <Route path="/patients/:id/access-log" element={<PatientAccessLogPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Dr. Emily Watson (Pulmonology)')).toBeInTheDocument()
    })

    // Check doctor names and events
    expect(screen.getByText('Dr. Sarah Lin (Cardiology)')).toBeInTheDocument()
    expect(screen.getByText('Dr. Mark Sloan')).toBeInTheDocument()

    // Break glass badge
    expect(screen.getByText('BREAK-GLASS')).toBeInTheDocument()
    expect(screen.getByText('acute respiratory distress')).toBeInTheDocument()
  })

  it('filters to break-glass overrides only when selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/access-log']}>
          <Routes>
            <Route path="/patients/:id/access-log" element={<PatientAccessLogPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Dr. Emily Watson (Pulmonology)')).toBeInTheDocument()
    })

    const select = screen.getByLabelText('Filter by access type')
    fireEvent.change(select, { target: { value: 'break_glass_emergency' } })

    // The break glass row should still be there
    expect(screen.getByText('Dr. Emily Watson (Pulmonology)')).toBeInTheDocument()
    // The regular read and denied read should be filtered out
    expect(screen.queryByText('Dr. Sarah Lin (Cardiology)')).not.toBeInTheDocument()
    expect(screen.queryByText('Dr. Mark Sloan')).not.toBeInTheDocument()
  })
})
