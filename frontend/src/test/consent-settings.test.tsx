import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsentSettingsPage } from '../pages/ConsentSettingsPage'
import { api } from '../services/api'
import type { PatientConsentResponse } from '../types/consent'
import type { PatientNotificationResponse } from '../types/access_log'

const mockConsents: PatientConsentResponse[] = [
  {
    consent_id: 'CONSENT-001',
    patient_id: 'PAT-SYN-001',
    purpose: 'Direct Clinical Care & Referral',
    categories: ['demographics', 'allergies', 'medications', 'encounters'],
    recipient: 'USR-DOC-CARDIO-001',
    text_version: 'v1.0-standard-clinical',
    status: 'granted',
    effective_from: '2026-10-01T00:00:00Z',
    revoked_at: null,
    revocation_reason: null,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    consent_id: 'CONSENT-002',
    patient_id: 'PAT-SYN-001',
    purpose: 'Clinical Research Study',
    categories: ['medications'],
    recipient: 'ORG-RESEARCH-001',
    text_version: 'v1.0-standard-clinical',
    status: 'revoked',
    effective_from: '2026-09-01T00:00:00Z',
    revoked_at: '2026-10-15T12:00:00Z',
    revocation_reason: 'Patient opted out of observational research study',
    created_at: '2026-09-01T00:00:00Z',
  },
]

const mockNotifications: PatientNotificationResponse[] = [
  {
    notification_id: 'NOTIF-001',
    patient_id: 'PAT-SYN-001',
    type: 'break_glass_access',
    priority: 'HIGH',
    title: 'Emergency Break-Glass Override Activated',
    message: 'Dr. Emily Watson accessed emergency profile under justification: Acute trauma intake',
    read: false,
    created_at: '2026-11-02T18:00:00Z',
    metadata: { session_id: 'BG-001' },
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
      userId: 'PAT-SYN-001',
      name: 'Eleanor Vance',
      email: 'eleanor.vance@synthetic.vericare.internal',
      role: 'patient',
      organizationId: 'HOSP-METRO-001',
    },
  }),
}))

describe('ConsentSettingsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    ;(api.get as any).mockImplementation((url: string) => {
      if (url.includes('/consents')) {
        return Promise.resolve(mockConsents)
      }
      if (url.includes('/notifications')) {
        return Promise.resolve(mockNotifications)
      }
      return Promise.reject(new Error('Unknown url: ' + url))
    })
  })

  it('renders active consent directives and patient alerts', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/consent']}>
          <Routes>
            <Route path="/patients/:id/consent" element={<ConsentSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('USR-DOC-CARDIO-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Consent Directives & Privacy Controls')).toBeInTheDocument()
    expect(screen.getByText('Direct Clinical Care & Referral')).toBeInTheDocument()
    expect(screen.getByText('GRANTED')).toBeInTheDocument()

    // Check revoked entry
    expect(screen.getByText('ORG-RESEARCH-001')).toBeInTheDocument()
    expect(screen.getByText('REVOKED')).toBeInTheDocument()

    // Check notification alert
    expect(screen.getByText('Emergency Break-Glass Override Activated')).toBeInTheDocument()
  })

  it('opens Revoke modal when revoke button is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/consent']}>
          <Routes>
            <Route path="/patients/:id/consent" element={<ConsentSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('USR-DOC-CARDIO-001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Revoke'))

    expect(screen.getByText('Revoke Consent Directive')).toBeInTheDocument()
    expect(screen.getByText(/Immediate Backend Sharing Block/i)).toBeInTheDocument()
    expect(screen.getByText(/Mandatory Revocation Reason/i)).toBeInTheDocument()
  })

  it('opens Grant Consent modal when Grant Directive button is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/consent']}>
          <Routes>
            <Route path="/patients/:id/consent" element={<ConsentSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('USR-DOC-CARDIO-001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Grant Directive'))

    expect(screen.getByText('Grant Clinical Data Sharing Directive')).toBeInTheDocument()
    expect(screen.getByText(/Recipient Organization \/ Care Team/i)).toBeInTheDocument()
  })
})
