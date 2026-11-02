import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AriaNoticeModal } from '../components/aria/AriaNoticeModal'
import { AriaChatPage } from '../pages/AriaChatPage'
import { AriaSharingPage } from '../pages/AriaSharingPage'
import { api } from '../services/api'
import type {
  AriaNoticeStatus,
  AriaSession,
  AriaMessage,
  AriaSendMessageResponse,
  AriaSharedSummary,
  AriaDraftSummaryResponse,
} from '../types/aria'

describe('Aria Companion Integration Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  it('AriaNoticeModal renders mandatory non-clinical disclaimer and requires acknowledgment checkbox', async () => {
    const mockNotice: AriaNoticeStatus = {
      acknowledged: false,
      provider_label: 'Mock Aria Service (Local Prototype)',
      mode: 'mock',
      disclaimer_text: 'Aria is not a clinician',
    }

    const onAcknowledge = vi.fn().mockResolvedValue(undefined)

    render(<AriaNoticeModal notice={mockNotice} onAcknowledge={onAcknowledge} />)

    // Check modal contents
    expect(screen.getByText(/Important Notice: Aria Mental Health Companion/i)).toBeInTheDocument()
    expect(screen.getByText(/Mock Aria Service \(Local Prototype\)/i)).toBeInTheDocument()
    expect(screen.getByText(/MOCK \/ PLACEHOLDER MODE/i)).toBeInTheDocument()
    expect(screen.getByText(/Not a Clinician or Diagnostic Tool/i)).toBeInTheDocument()

    // Confirm button should be disabled until checkbox agreed
    const confirmButton = screen.getByRole('button', { name: /Acknowledge & Continue/i })
    expect(confirmButton).toBeDisabled()

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(confirmButton).not.toBeDisabled()

    fireEvent.click(confirmButton)
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('AriaChatPage displays mock mode banner and sends reflection messages', async () => {
    const mockNotice: AriaNoticeStatus = {
      acknowledged: true,
      provider_label: 'MockAriaProvider',
      mode: 'mock',
      disclaimer_text: 'Aria is not a clinician',
    }

    const mockSession: AriaSession = {
      session_ref: 'SES-TEST-001',
      patient_id: 'PAT-SYN-001',
      title: 'Daily Journal & Reflection',
      status: 'active',
      created_at: '2026-11-02T10:00:00Z',
      updated_at: '2026-11-02T10:00:00Z',
    }

    const mockInitialMessages: AriaMessage[] = [
      {
        message_id: 'MSG-001',
        session_ref: 'SES-TEST-001',
        patient_id: 'PAT-SYN-001',
        sender: 'user',
        text: 'I felt a bit anxious this morning.',
        safety_event: false,
        provider_name: 'USER',
        created_at: '2026-11-02T10:01:00Z',
      },
      {
        message_id: 'MSG-002',
        session_ref: 'SES-TEST-001',
        patient_id: 'PAT-SYN-001',
        sender: 'companion',
        text: 'Thank you for reflecting on your morning. What felt most challenging?',
        safety_event: false,
        provider_name: 'MOCK',
        created_at: '2026-11-02T10:01:05Z',
      },
    ]

    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/aria/notice') return mockNotice
      if (url === '/aria/sessions') return [mockSession]
      if (url.includes('/messages')) return mockInitialMessages
      return {}
    })

    const sendResponse: AriaSendMessageResponse = {
      user_message: {
        message_id: 'MSG-003',
        session_ref: 'SES-TEST-001',
        patient_id: 'PAT-SYN-001',
        sender: 'user',
        text: 'I took a walk and it helped.',
        safety_event: false,
        provider_name: 'USER',
        created_at: '2026-11-02T10:05:00Z',
      },
      reply_message: {
        message_id: 'MSG-004',
        session_ref: 'SES-TEST-001',
        patient_id: 'PAT-SYN-001',
        sender: 'companion',
        text: 'Walking can provide a good pause. Keep taking care of yourself.',
        safety_event: false,
        provider_name: 'MOCK',
        created_at: '2026-11-02T10:05:05Z',
      },
      safety_event: false,
    }

    vi.spyOn(api, 'post').mockResolvedValue(sendResponse)

    render(
      <MemoryRouter initialEntries={['/aria']}>
        <Routes>
          <Route path="/aria" element={<AriaChatPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/Aria Companion Journal/i)).toBeInTheDocument()
      expect(screen.getByText(/Demo \/ Placeholder Mode:/i)).toBeInTheDocument()
      expect(screen.getByText(/I felt a bit anxious this morning./i)).toBeInTheDocument()
    })

    // Type and send message
    const textarea = screen.getByPlaceholderText(/Write your private reflection/i)
    fireEvent.change(textarea, { target: { value: 'I took a walk and it helped.' } })

    const sendBtn = screen.getByRole('button', { name: /Send/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/aria/sessions/SES-TEST-001/messages',
        { text: 'I took a walk and it helped.' }
      )
      expect(screen.getByText(/Walking can provide a good pause/i)).toBeInTheDocument()
    })
  })

  it('AriaChatPage triggers distinct crisis alert box upon safety event', async () => {
    const mockNotice: AriaNoticeStatus = {
      acknowledged: true,
      provider_label: 'MockAriaProvider',
      mode: 'mock',
      disclaimer_text: 'Aria is not a clinician',
    }

    const mockSession: AriaSession = {
      session_ref: 'SES-TEST-002',
      patient_id: 'PAT-SYN-001',
      title: 'Daily Journal & Reflection',
      status: 'active',
      created_at: '2026-11-02T10:00:00Z',
      updated_at: '2026-11-02T10:00:00Z',
    }

    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/aria/notice') return mockNotice
      if (url === '/aria/sessions') return [mockSession]
      if (url.includes('/messages')) return []
      return {}
    })

    const crisisResponse: AriaSendMessageResponse = {
      user_message: {
        message_id: 'MSG-010',
        session_ref: 'SES-TEST-002',
        patient_id: 'PAT-SYN-001',
        sender: 'user',
        text: 'I feel like ending my life.',
        safety_event: true,
        provider_name: 'USER',
        created_at: '2026-11-02T11:00:00Z',
      },
      reply_message: {
        message_id: 'MSG-011',
        session_ref: 'SES-TEST-002',
        patient_id: 'PAT-SYN-001',
        sender: 'companion',
        text: 'I am hearing how much pain you are in. Please connect with immediate human help.',
        safety_event: true,
        provider_name: 'MOCK',
        created_at: '2026-11-02T11:00:01Z',
      },
      safety_event: true,
      crisis_resources: [
        {
          name: '988 Suicide & Crisis Lifeline',
          helpline: '988',
          description: 'Free, confidential support 24/7',
          url: 'https://988lifeline.org',
        },
      ],
    }

    vi.spyOn(api, 'post').mockResolvedValue(crisisResponse)

    render(
      <MemoryRouter initialEntries={['/aria']}>
        <Routes>
          <Route path="/aria" element={<AriaChatPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Aria Companion Journal/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/Write your private reflection/i)
    fireEvent.change(textarea, { target: { value: 'I feel like ending my life.' } })

    const sendBtn = screen.getByRole('button', { name: /Send/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      // Distinct crisis alert box
      expect(
        screen.getByRole('alert')
      ).toBeInTheDocument()
      expect(screen.getByText(/Support & Crisis Helplines Available Right Now/i)).toBeInTheDocument()
      expect(screen.getByText(/988 Suicide & Crisis Lifeline/i)).toBeInTheDocument()
      expect(screen.getByText('988')).toBeInTheDocument()
    })
  })

  it('AriaSharingPage drafts summary, allows editing, approves share snapshot, and revokes access', async () => {
    const mockSessions: AriaSession[] = [
      {
        session_ref: 'SES-TEST-001',
        patient_id: 'PAT-SYN-001',
        title: 'Weekly Reflections',
        status: 'active',
        created_at: '2026-11-02T10:00:00Z',
        updated_at: '2026-11-02T10:00:00Z',
      },
    ]

    const mockShares: AriaSharedSummary[] = [
      {
        summary_id: 'SUMM-001',
        patient_id: 'PAT-SYN-001',
        session_ref: 'SES-TEST-001',
        recipient_id: 'USR-VERIFIER-001',
        approved_text: 'Prior patient approved snapshot text.',
        created_at: '2026-11-01T15:00:00Z',
        status: 'active',
      },
    ]

    const mockDraft: AriaDraftSummaryResponse = {
      draft_text: 'Patient reports sleep disturbance and morning anxiety over the past 5 days.',
      session_ref: 'SES-TEST-001',
    }

    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/aria/sessions') return mockSessions
      if (url === '/aria/shares') return mockShares
      if (url.includes('/draft-summary')) return mockDraft
      return {}
    })

    const mockApprovedShare: AriaSharedSummary = {
      summary_id: 'SUMM-002',
      patient_id: 'PAT-SYN-001',
      session_ref: 'SES-TEST-001',
      recipient_id: 'USR-VERIFIER-001',
      approved_text: 'Patient reports sleep disturbance. Morning anxiety is moderate.',
      created_at: '2026-11-02T12:00:00Z',
      status: 'active',
    }

    vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
      if (url === '/aria/shares') return mockApprovedShare
      if (url.includes('/revoke')) return { status: 'revoked' }
      return {}
    })

    render(
      <MemoryRouter initialEntries={['/aria/shares']}>
        <Routes>
          <Route path="/aria/shares" element={<AriaSharingPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Verify initial load
    await waitFor(() => {
      expect(
        screen.getByText(/Share Companion Reflections with Care Team/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/Prior patient approved snapshot text./i)).toBeInTheDocument()
    })

    // Click Draft Summary
    const draftBtn = screen.getByRole('button', { name: /Draft Summary for Clinician/i })
    fireEvent.click(draftBtn)

    await waitFor(() => {
      expect(
        screen.getByDisplayValue(/Patient reports sleep disturbance and morning anxiety/i)
      ).toBeInTheDocument()
    })

    // Edit textarea
    const draftTextarea = screen.getByDisplayValue(/Patient reports sleep disturbance/i)
    fireEvent.change(draftTextarea, {
      target: { value: 'Patient reports sleep disturbance. Morning anxiety is moderate.' },
    })

    // Approve share
    const approveBtn = screen.getByRole('button', { name: /Approve & Share Snapshot/i })
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/aria/shares', {
        session_ref: 'SES-TEST-001',
        recipient_id: 'USR-VERIFIER-001',
        approved_text: 'Patient reports sleep disturbance. Morning anxiety is moderate.',
      })
      expect(screen.getByText(/Summary snapshot successfully approved/i)).toBeInTheDocument()
    })

    // Revoke share on the newly approved share (index 0)
    const revokeBtn = screen.getAllByRole('button', { name: /Revoke Access/i })[0]
    fireEvent.click(revokeBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/aria/shares/SUMM-002/revoke')
    })
  })
})
