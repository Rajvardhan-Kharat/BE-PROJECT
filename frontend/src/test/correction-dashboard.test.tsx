import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CorrectionDashboardPage } from '../pages/CorrectionDashboardPage'
import { api } from '../services/api'
import type { CorrectionDashboardMetrics } from '../types/corrections'

const mockMetrics: CorrectionDashboardMetrics = {
  total_documents_reviewed: 14,
  total_fields_reviewed: 188,
  total_corrections: 21,
  overall_correction_rate: 11.2,
  accepted_unchanged_share: 88.8,
  avg_review_time_seconds: 38.4,
  by_field_type: [
    {
      field_type: 'medication',
      total_reviewed: 42,
      corrections_count: 4,
      correction_rate: 9.5,
      common_reasons: ['Reconciled brand name to generic'],
    },
    {
      field_type: 'dosage',
      total_reviewed: 36,
      corrections_count: 6,
      correction_rate: 16.7,
      common_reasons: ['Missing unit of measure (mg vs mcg)'],
    },
    {
      field_type: 'allergy',
      total_reviewed: 22,
      corrections_count: 1,
      correction_rate: 4.5,
      common_reasons: ['Clarified mild GI upset vs anaphylactic allergy'],
    },
  ],
  top_reasons: [
    { reason: 'Missing unit of measure (mg vs mcg)', count: 6 },
    { reason: 'Reconciled brand name to generic', count: 4 },
  ],
  synthetic_benchmark_notice: 'measured on synthetic data',
  last_calculated_at: '2026-11-02T21:00:00Z',
}

describe('CorrectionDashboardPage Test Suite', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  it('renders header with mandatory synthetic data label and KPI metrics', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockMetrics })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/corrections']}>
          <Routes>
            <Route path="/corrections" element={<CorrectionDashboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Title & Mandatory Label
    expect(screen.getByText('Human Correction & Review Analytics')).toBeInTheDocument()
    expect(screen.getAllByText(/measured on synthetic data/i).length).toBeGreaterThanOrEqual(1)

    // Benchmark Notice Alert
    expect(screen.getByText(/Academic Benchmark: Measured on Synthetic Data/i)).toBeInTheDocument()

    // KPI Cards
    await waitFor(() => {
      expect(screen.getByText('11.2%')).toBeInTheDocument()
      expect(screen.getByText('88.8%')).toBeInTheDocument()
      expect(screen.getByText('38.4s')).toBeInTheDocument()
      expect(screen.getByText('14')).toBeInTheDocument()
    })

    // Field-Type Table
    expect(screen.getByText('medication')).toBeInTheDocument()
    expect(screen.getByText('dosage')).toBeInTheDocument()
    expect(screen.getByText('allergy')).toBeInTheDocument()
    expect(screen.getByText('16.7%')).toBeInTheDocument()

    // Frequent Rationales
    expect(screen.getAllByText('Missing unit of measure (mg vs mcg)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Reconciled brand name to generic').length).toBeGreaterThanOrEqual(1)
  })
})
