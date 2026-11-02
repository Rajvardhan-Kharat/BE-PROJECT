import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminBreakGlassReviewPage } from '../pages/AdminBreakGlassReviewPage'
import { api } from '../services/api'
import type { BreakGlassSession } from '../types/break_glass'

const mockSessions: BreakGlassSession[] = [
  {
    session_id: 'BG-SESS-9001',
    patient_id: 'PAT-SYN-001',
    doctor_id: 'USR-DOC-PULMO-001',
    justification: 'Severe anaphylaxis and unconscious presentation in acute resuscitation bay.',
    reason_category: 'acute_resuscitation',
    created_at: '2026-11-02T19:00:00Z',
    expires_at: '2026-11-02T20:00:00Z',
    is_active: true,
    remaining_minutes: 45,
    review_status: 'pending_review',
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
  },
  {
    session_id: 'BG-SESS-9002',
    patient_id: 'PAT-SYN-001',
    doctor_id: 'USR-DOC-ORTHO-001',
    justification: 'Checking general historical notes for tomorrow outpatient clinic.',
    reason_category: 'missing_critical_history',
    created_at: '2026-11-01T10:00:00Z',
    expires_at: '2026-11-01T11:00:00Z',
    is_active: false,
    remaining_minutes: 0,
    review_status: 'questioned',
    reviewed_by: 'USR-ADMIN-HOSP-001',
    reviewed_at: '2026-11-01T14:30:00Z',
    review_notes: 'Non-emergency usage. Routine outpatient preparation does not meet break-glass criteria.',
  },
]

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      userId: 'USR-ADMIN-HOSP-001',
      name: 'David Miller',
      email: 'admin.david@synthetic.vericare.internal',
      role: 'hospital_admin',
    },
  }),
}))

describe('AdminBreakGlassReviewPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    ;(api.get as any).mockResolvedValue(mockSessions)
  })

  it('renders sessions and allows opening audit review dialog', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminBreakGlassReviewPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('USR-DOC-PULMO-001')).toBeInTheDocument()
    })

    expect(screen.getByText('USR-DOC-ORTHO-001')).toBeInTheDocument()
    expect(screen.getByText('Pending Audit')).toBeInTheDocument()
    expect(screen.getByText('Questioned')).toBeInTheDocument()

    // Click "Audit Review" on pending session
    fireEvent.click(screen.getByText('Audit Review'))

    expect(screen.getByText('Administrative Review of Override')).toBeInTheDocument()
    expect(screen.getAllByText(/Severe anaphylaxis and unconscious presentation/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Justified (Compliant)')).toBeInTheDocument()
    expect(screen.getByText('Questioned (Flagged)')).toBeInTheDocument()
  })

  it('submits review determination and updates session', async () => {
    ;(api.post as any).mockResolvedValue({
      ...mockSessions[0],
      review_status: 'justified',
      reviewed_by: 'USR-ADMIN-HOSP-001',
      review_notes: 'Verified emergency room admission log, acute indication confirmed.',
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminBreakGlassReviewPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Audit Review')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Audit Review'))

    const textarea = screen.getByPlaceholderText(/Record formal administrative findings/i)
    fireEvent.change(textarea, {
      target: { value: 'Verified emergency room admission log, acute indication confirmed.' },
    })

    fireEvent.click(screen.getByText('Save Audit Determination'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/break-glass/admin/BG-SESS-9001/review', {
        review_status: 'justified',
        review_notes: 'Verified emergency room admission log, acute indication confirmed.',
      })
    })
  })
})
