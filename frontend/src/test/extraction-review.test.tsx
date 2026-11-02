import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExtractionStatusChip } from '../components/ui/ExtractionStatusChip'
import { DocumentTextViewer } from '../components/extraction/DocumentTextViewer'
import { ExtractedFieldsList } from '../components/extraction/ExtractedFieldsList'
import { ExtractionReviewPage } from '../pages/ExtractionReviewPage'
import { DocumentUploadPage } from '../pages/DocumentUploadPage'
import { AuthProvider } from '../context/AuthContext'
import type { ExtractedField, ExtractionFieldStatus } from '../types/document'

const mockFields: ExtractedField[] = [
  {
    field_name: 'primary_diagnosis',
    value: 'Paroxysmal atrial fibrillation (ICD-10 I48.0)',
    confidence_note: 'Extracted with high confidence from discharge summary',
    status: 'explicit',
    source_span: {
      doc: 'DOC-SYN-84920-01',
      page: 1,
      start: 25,
      end: 70,
      quote: 'Paroxysmal atrial fibrillation (ICD-10 I48.0)',
    },
  },
  {
    field_name: 'admission_date',
    value: '2026-10-15',
    confidence_note: 'Inferred from admission note header',
    status: 'inferred',
    source_span: {
      doc: 'DOC-SYN-84920-01',
      page: 1,
      start: 85,
      end: 95,
      quote: '2026-10-15',
    },
  },
  {
    field_name: 'discharge_disposition',
    value: 'Home with home health',
    confidence_note: 'Ambiguous wording in notes',
    status: 'uncertain',
    source_span: null,
  },
  {
    field_name: 'follow_up_date',
    value: null,
    confidence_note: 'Follow-up appointment not scheduled',
    status: 'missing',
    source_span: null,
  },
  {
    field_name: 'blood_pressure',
    value: '138/85 vs 120/80',
    confidence_note: 'Conflicting vitals between triage and rounds',
    status: 'conflicting',
    source_span: null,
  },
]

const mockPageTexts: Record<number, string> = {
  1: 'Patient clinical record. Paroxysmal atrial fibrillation (ICD-10 I48.0). Admitted on 2026-10-15 for observation.',
}

function renderWithProviders(ui: React.ReactElement) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={testQueryClient}>
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('ExtractionStatusChip', () => {
  const statuses: ExtractionFieldStatus[] = [
    'explicit',
    'inferred',
    'uncertain',
    'missing',
    'conflicting',
  ]

  it.each(statuses)('renders text + icon for status "%s"', (status) => {
    const { container } = render(<ExtractionStatusChip status={status} />)
    expect(screen.getByText(new RegExp(status, 'i'))).toBeInTheDocument()
    // SVG icon must be rendered
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})

describe('DocumentTextViewer & Span Highlighting', () => {
  it('renders document text and highlighted spans with correct offsets', () => {
    const onSelectField = vi.fn()
    render(
      <DocumentTextViewer
        pageTexts={mockPageTexts}
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
        fields={mockFields}
        selectedFieldName={null}
        onSelectField={onSelectField}
      />
    )

    const spanElement = screen.getByTestId('span-primary_diagnosis')
    expect(spanElement).toBeInTheDocument()
    expect(spanElement.textContent).toBe('Paroxysmal atrial fibrillation (ICD-10 I48.0)')
  })

  it('highlights exact span with active styling when selectedFieldName matches', () => {
    const { rerender } = render(
      <DocumentTextViewer
        pageTexts={mockPageTexts}
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
        fields={mockFields}
        selectedFieldName={null}
        onSelectField={vi.fn()}
      />
    )

    let spanElement = screen.getByTestId('span-primary_diagnosis')
    expect(spanElement.className).toContain('bg-amber-100')
    expect(spanElement.className).not.toContain('bg-teal-200')

    // Now re-render with primary_diagnosis selected
    rerender(
      <DocumentTextViewer
        pageTexts={mockPageTexts}
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
        fields={mockFields}
        selectedFieldName="primary_diagnosis"
        onSelectField={vi.fn()}
      />
    )

    spanElement = screen.getByTestId('span-primary_diagnosis')
    expect(spanElement.className).toContain('bg-teal-200')
    expect(spanElement.className).toContain('border-teal-800')
  })

  it('clicking a highlight span selects the field', () => {
    const onSelectField = vi.fn()
    render(
      <DocumentTextViewer
        pageTexts={mockPageTexts}
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
        fields={mockFields}
        selectedFieldName={null}
        onSelectField={onSelectField}
      />
    )

    const spanElement = screen.getByTestId('span-primary_diagnosis')
    fireEvent.click(spanElement)
    expect(onSelectField).toHaveBeenCalledWith('primary_diagnosis')
  })
})

describe('ExtractedFieldsList & Human Corrections', () => {
  it('clicking a field card invokes onSelectField', () => {
    const onSelectField = vi.fn()
    render(
      <ExtractedFieldsList
        fields={mockFields}
        selectedFieldName={null}
        onSelectField={onSelectField}
        onSaveCorrection={vi.fn()}
      />
    )

    const card = screen.getByTestId('field-card-primary_diagnosis')
    fireEvent.click(card)
    expect(onSelectField).toHaveBeenCalledWith('primary_diagnosis')
  })

  it('allows reviewer to edit a value and stores human correction (original, corrected, reason)', () => {
    const onSaveCorrection = vi.fn()
    render(
      <ExtractedFieldsList
        fields={mockFields}
        selectedFieldName="primary_diagnosis"
        onSelectField={vi.fn()}
        onSaveCorrection={onSaveCorrection}
      />
    )

    // Find and click the edit button on primary_diagnosis card
    const card = screen.getByTestId('field-card-primary_diagnosis')
    const editBtn = card.querySelector('button[title*="Edit"]')
    expect(editBtn).toBeInTheDocument()
    fireEvent.click(editBtn!)

    // Input for corrected value should appear
    const input = screen.getByPlaceholderText('Enter verified clinical value...')
    expect(input).toBeInTheDocument()

    // Type a corrected value
    fireEvent.change(input, {
      target: { value: 'Paroxysmal atrial fibrillation (ICD-10 I48.0) - VERIFIED' },
    })

    // Click Save correction
    const saveBtn = screen.getByRole('button', { name: /save correction/i })
    fireEvent.click(saveBtn)

    expect(onSaveCorrection).toHaveBeenCalledWith(
      'primary_diagnosis',
      'Paroxysmal atrial fibrillation (ICD-10 I48.0) - VERIFIED',
      expect.any(String)
    )
  })

  it('displays human-corrected badge, original value strikethrough, and reason when correction exists', () => {
    const correctedFields: ExtractedField[] = [
      {
        ...mockFields[0],
        human_correction: {
          field_name: 'primary_diagnosis',
          original_value: 'Paroxysmal AFib',
          corrected_value: 'Atrial Flutter with RVR',
          reason: 'Misread clinical dosage / frequency',
          corrected_by: 'DOC-SYN-001',
          corrected_at: '2026-10-31T15:00:00Z',
        },
      },
    ]

    render(
      <ExtractedFieldsList
        fields={correctedFields}
        selectedFieldName={null}
        onSelectField={vi.fn()}
        onSaveCorrection={vi.fn()}
      />
    )

    expect(screen.getByText('Human Corrected')).toBeInTheDocument()
    expect(screen.getByText('Paroxysmal AFib')).toBeInTheDocument()
    expect(screen.getByText('Atrial Flutter with RVR')).toBeInTheDocument()
    expect(screen.getByText(/Reason: Misread clinical dosage/i)).toBeInTheDocument()
  })
})

describe('ExtractionReviewPage Integration', () => {
  it('renders split view with document viewer and fields list', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/documents/:id/review" element={<ExtractionReviewPage />} />
        <Route path="/" element={<ExtractionReviewPage />} />
      </Routes>
    )

    // Document viewer on left
    await waitFor(() => {
      expect(screen.getByText(/Extracted Clinical Fields/i)).toBeInTheDocument()
      expect(screen.getByText(/METRO HEALTH UNIVERSITY MEDICAL CENTER/i)).toBeInTheDocument()
    })

    // Clicking a field card highlights its span on the left
    const fieldCard = screen.getByTestId('field-card-primary_diagnosis')
    fireEvent.click(fieldCard)

    const spanElement = screen.getByTestId('span-primary_diagnosis')
    expect(spanElement.className).toContain('bg-teal-200')
  })
})

describe('DocumentUploadPage', () => {
  it('renders upload interface with drop zone and patient selector', () => {
    renderWithProviders(<DocumentUploadPage />)

    expect(screen.getByText(/Clinical Document Ingestion/i)).toBeInTheDocument()
    expect(screen.getByText(/Target Patient/i)).toBeInTheDocument()
    expect(screen.getByText(/Click to select or drag and drop clinical PDF/i)).toBeInTheDocument()
    expect(screen.getByText(/Untrusted Input/i)).toBeInTheDocument()
  })

  it('handles file selection and displays staged queued progress status', async () => {
    renderWithProviders(<DocumentUploadPage />)

    // Create a dummy PDF file
    const file = new File(['%PDF-1.4 sample content'], 'cardiology_discharge.pdf', {
      type: 'application/pdf',
    })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { files: [file] } })

    // File name and size should be displayed
    expect(screen.getByText('cardiology_discharge.pdf')).toBeInTheDocument()
    expect(screen.getByText(/Status: Staged & Queued for Processing/i)).toBeInTheDocument()
  })
})
