import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollaborationWorkspacePage } from '../pages/CollaborationWorkspacePage'
import { api } from '../services/api'
import type { ClinicalNote, ClinicalTask, SpecialistQuery } from '../types/collaboration'

const mockNotes: ClinicalNote[] = [
  {
    note_id: 'NOTE-SYN-001',
    patient_id: 'PAT-SYN-001',
    author_id: 'USR-DOC-CARDIO-001',
    author_name: 'Dr. Marcus Vance',
    author_role: 'doctor',
    specialty: 'Cardiology',
    title: 'Post-MI Beta-Blocker Titration Plan',
    content: 'Patient tolerated Metoprolol well. Target resting HR is 60-70 bpm.',
    is_private: false,
    tags: ['Cardiology', 'Titration'],
    citations: [
      {
        record_id: 'REC-001',
        record_type: 'discharge',
        date: '2026-10-18',
        snippet: 'Metoprolol 25mg BID',
      },
    ],
    created_at: '2026-10-18T15:00:00Z',
    updated_at: '2026-10-18T15:00:00Z',
  },
  {
    note_id: 'NOTE-SYN-003',
    patient_id: 'PAT-SYN-001',
    author_id: 'USR-DOC-CARDIO-001',
    author_name: 'Dr. Marcus Vance',
    author_role: 'doctor',
    specialty: 'Cardiology',
    title: 'Private Clinician Impression: Renal Trend Concerns',
    content: 'Confidential scratchpad: Serum creatinine trend suggests early ACEI intolerance.',
    is_private: true,
    tags: ['Private', 'Renal'],
    citations: [],
    created_at: '2026-10-31T16:00:00Z',
    updated_at: '2026-10-31T16:00:00Z',
  },
]

const mockTasks: ClinicalTask[] = [
  {
    task_id: 'TSK-SYN-001',
    patient_id: 'PAT-SYN-001',
    title: 'Schedule Repeat BMP',
    description: 'Check potassium and serum creatinine prior to ACE-inhibitor adjustment.',
    assigned_to: 'USR-VERIFIER-001',
    assigned_to_name: 'Dr. Sarah Lin',
    assigned_by: 'USR-DOC-CARDIO-001',
    assigned_by_name: 'Dr. Marcus Vance',
    priority: 'high',
    due_date: '2026-11-12',
    status: 'pending',
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-01T08:00:00Z',
  },
]

const mockQueries: SpecialistQuery[] = [
  {
    query_id: 'QRY-SYN-001',
    patient_id: 'PAT-SYN-001',
    from_doctor_id: 'USR-DOC-CARDIO-001',
    from_doctor_name: 'Dr. Marcus Vance',
    from_specialty: 'Cardiology',
    to_doctor_id: 'USR-VERIFIER-001',
    to_doctor_name: 'Dr. Sarah Lin',
    to_specialty: 'Internal Medicine',
    subject: 'Renal titration threshold with Lisinopril',
    question: "Sarah, Eleanor's creatinine is 1.4 mg/dL. Can we maintain Lisinopril?",
    priority: 'routine',
    status: 'answered',
    responses: [
      {
        response_id: 'RESP-001',
        doctor_id: 'USR-VERIFIER-001',
        doctor_name: 'Dr. Sarah Lin',
        specialty: 'Internal Medicine',
        answer: 'Marcus, keep Lisinopril for now but repeat BMP in 10 days.',
        created_at: '2026-11-01T14:30:00Z',
      },
    ],
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-01T14:30:00Z',
  },
]

describe('CollaborationWorkspacePage Test Suite', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  it('renders workspace tabs and displays Second Memory notes with private badge', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/collaboration/notes')) return { data: mockNotes }
      if (url.includes('/collaboration/tasks')) return { data: mockTasks }
      if (url.includes('/collaboration/queries')) return { data: mockQueries }
      return { data: [] }
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/workspace']}>
          <Routes>
            <Route path="/patients/:id/workspace" element={<CollaborationWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Header & Tabs
    expect(screen.getByText('Care-Team Workspace & Second Memory')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Second Memory \(2\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Care-Team Tasks \(1\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Specialist Queries \(1\)/i)).toBeInTheDocument()
    })

    // Notes list
    await waitFor(() => {
      expect(screen.getByText('Post-MI Beta-Blocker Titration Plan')).toBeInTheDocument()
      expect(screen.getByText('Private Clinician Impression: Renal Trend Concerns')).toBeInTheDocument()
    })

    // Private indicator
    expect(screen.getByText(/Private \(Author Only\)/i)).toBeInTheDocument()
  })

  it('synthesizes cited summary with record list and quotes', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/collaboration/notes')) return { data: mockNotes }
      if (url.includes('/collaboration/tasks')) return { data: mockTasks }
      if (url.includes('/collaboration/queries')) return { data: mockQueries }
      return { data: [] }
    })

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        patient_id: 'PAT-SYN-001',
        date_range: { from: '2026-10-01', to: '2026-11-05' },
        summary_text: 'Second Memory Clinical Synthesis: Beta-Blocker titration stable.',
        cited_records: [
          {
            note_id: 'NOTE-SYN-001',
            author_name: 'Dr. Marcus Vance',
            specialty: 'Cardiology',
            date: '2026-10-18',
            snippet: 'Target resting HR is 60-70 bpm.',
          },
        ],
        total_notes_analyzed: 2,
        generated_at: '2026-11-02T20:00:00Z',
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/workspace']}>
          <Routes>
            <Route path="/patients/:id/workspace" element={<CollaborationWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Click Cited Summary button
    const summaryBtn = screen.getByRole('button', { name: /Cited Summary/i })
    fireEvent.click(summaryBtn)

    // Modal opens
    expect(screen.getByText(/Synthesize Cited Second Memory Summary/i)).toBeInTheDocument()

    // Click Generate
    const generateBtn = screen.getByRole('button', { name: /Generate Cited Summary/i })
    fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/collaboration/notes/patient/PAT-SYN-001/cited-summary',
        expect.objectContaining({
          date_from: '2026-10-01',
          date_to: '2026-11-05',
        })
      )
      expect(screen.getByText(/Beta-Blocker titration stable/i)).toBeInTheDocument()
      expect(screen.getByText(/Exact Record Citations/i)).toBeInTheDocument()
    })
  })

  it('switches to Tasks tab and toggles task completion', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/collaboration/notes')) return { data: mockNotes }
      if (url.includes('/collaboration/tasks')) return { data: mockTasks }
      if (url.includes('/collaboration/queries')) return { data: mockQueries }
      return { data: [] }
    })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: { ...mockTasks[0], status: 'completed' },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/workspace']}>
          <Routes>
            <Route path="/patients/:id/workspace" element={<CollaborationWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Switch to Tasks tab
    const tasksTab = screen.getByText(/Care-Team Tasks/i)
    fireEvent.click(tasksTab)

    await waitFor(() => {
      expect(screen.getByText('Schedule Repeat BMP')).toBeInTheDocument()
      expect(screen.getByText('Dr. Sarah Lin')).toBeInTheDocument()
    })

    // Click status toggle
    // Click the checkbox button inside the row
    const taskCheckbox = screen.getAllByRole('row')[1].querySelector('button')
    if (taskCheckbox) {
      fireEvent.click(taskCheckbox)
      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/collaboration/tasks/TSK-SYN-001', {
          status: 'completed',
        })
      })
    }
  })

  it('switches to Queries tab and replies to specialist question', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/collaboration/notes')) return { data: mockNotes }
      if (url.includes('/collaboration/tasks')) return { data: mockTasks }
      if (url.includes('/collaboration/queries')) return { data: mockQueries }
      return { data: [] }
    })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: { ...mockQueries[0], status: 'answered' },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/patients/PAT-SYN-001/workspace']}>
          <Routes>
            <Route path="/patients/:id/workspace" element={<CollaborationWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Switch to Queries tab
    const queriesTab = screen.getByText(/Specialist Queries/i)
    fireEvent.click(queriesTab)

    await waitFor(() => {
      expect(screen.getByText('Renal titration threshold with Lisinopril')).toBeInTheDocument()
      expect(screen.getByText(/Sarah, Eleanor's creatinine is 1.4 mg\/dL/i)).toBeInTheDocument()
      expect(screen.getByText(/Marcus, keep Lisinopril for now/i)).toBeInTheDocument()
    })

    // Click Reply
    const replyBtn = screen.getByRole('button', { name: /Reply to Inquiry/i })
    fireEvent.click(replyBtn)

    // Type answer
    const textarea = screen.getByPlaceholderText(/Type specialist response/i)
    fireEvent.change(textarea, { target: { value: 'Agree with re-checking BMP in 10 days.' } })

    const submitBtn = screen.getByRole('button', { name: /Submit Answer/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/collaboration/queries/QRY-SYN-001/reply', {
        answer: 'Agree with re-checking BMP in 10 days.',
      })
    })
  })
})
