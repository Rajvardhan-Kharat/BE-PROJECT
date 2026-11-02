import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentExecutionLogsPage } from '../pages/AgentExecutionLogsPage'
import { api } from '../services/api'
import type { AgentRunLog } from '../types/agent_log'

const mockLogs: AgentRunLog[] = [
  {
    run_id: 'RUN-VERIFY-001',
    request_id: 'REQ-VERIFY-20261102-001',
    agent_name: 'verification_assistant',
    patient_id: 'PAT-SYN-001',
    version_id: 'VER-20261024-002',
    input_refs: ['patient:PAT-SYN-001', 'version:VER-20261024-002'],
    tools_called: [
      {
        tool_name: 'fetch_proposed_version',
        input_params: { version_id: 'VER-20261024-002' },
        output_summary: 'Loaded 1 proposed clinical fields',
        duration_ms: 12,
      },
      {
        tool_name: 'check_missing_uncertain_fields',
        input_params: { fields_count: 1 },
        output_summary: 'Found 0 missing required fields',
        duration_ms: 5,
      },
      {
        tool_name: 'compare_with_prior_approved',
        input_params: { patient_id: 'PAT-SYN-001' },
        output_summary: 'Identified 1 field changes against prior approved version',
        duration_ms: 22,
      },
    ],
    status: 'success',
    execution_summary:
      'Verified 1 proposed changes against prior clinical records. Generated advisory recommendation.',
    started_at: '2026-11-02T19:00:00Z',
    completed_at: '2026-11-02T19:00:01Z',
    duration_ms: 39,
    error_message: null,
  },
  {
    run_id: 'RUN-EMERGENCY-002',
    request_id: 'REQ-EMERGENCY-20261102-002',
    agent_name: 'emergency_summary_agent',
    patient_id: 'PAT-SYN-001',
    version_id: null,
    input_refs: ['patient:PAT-SYN-001'],
    tools_called: [
      {
        tool_name: 'fetch_approved_records',
        input_params: { patient_id: 'PAT-SYN-001' },
        output_summary: 'Retrieved 1 approved records',
        duration_ms: 15,
      },
      {
        tool_name: 'fetch_pending_records',
        input_params: { patient_id: 'PAT-SYN-001' },
        output_summary: 'Quarantined 1 pending unverified proposals',
        duration_ms: 10,
      },
    ],
    status: 'success',
    execution_summary:
      'Compiled 4-section emergency clinical summary. Quarantined 1 pending proposals.',
    started_at: '2026-11-02T19:05:00Z',
    completed_at: '2026-11-02T19:05:01Z',
    duration_ms: 25,
    error_message: null,
  },
]

function renderLogsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/agent-runs']}>
        <Routes>
          <Route path="/agent-runs" element={<AgentExecutionLogsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AgentExecutionLogsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders agent execution logs table with request IDs, tools called, and status', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockLogs)

    renderLogsPage()

    await waitFor(() => {
      expect(screen.getByText('REQ-VERIFY-20261102-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Agent Execution Logs')).toBeInTheDocument()
    expect(screen.getByText('verification_assistant')).toBeInTheDocument()
    expect(screen.getByText('emergency_summary_agent')).toBeInTheDocument()
    expect(screen.getByText('REQ-EMERGENCY-20261102-002')).toBeInTheDocument()
    expect(screen.getAllByText('SUCCESS').length).toBe(2)
  })

  it('expands a log row to reveal tool breakdown and execution summary', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockLogs)

    renderLogsPage()

    await waitFor(() => {
      expect(screen.getByText('REQ-VERIFY-20261102-001')).toBeInTheDocument()
    })

    // Click on the row for verification assistant
    const row = screen.getByText('verification_assistant')
    fireEvent.click(row)

    // Detailed trace drawer should be visible
    expect(screen.getByText('Execution Summary')).toBeInTheDocument()
    expect(
      screen.getByText(/Verified 1 proposed changes against prior clinical records/i)
    ).toBeInTheDocument()
    expect(screen.getAllByText('fetch_proposed_version').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('check_missing_uncertain_fields').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('compare_with_prior_approved')).toBeInTheDocument()
  })

  it('filters logs by search input', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockLogs)

    renderLogsPage()

    await waitFor(() => {
      expect(screen.getByText('REQ-VERIFY-20261102-001')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search by request ID/i)
    fireEvent.change(searchInput, { target: { value: 'REQ-EMERGENCY' } })

    expect(screen.queryByText('REQ-VERIFY-20261102-001')).toBeNull()
    expect(screen.getByText('REQ-EMERGENCY-20261102-002')).toBeInTheDocument()
  })
})
