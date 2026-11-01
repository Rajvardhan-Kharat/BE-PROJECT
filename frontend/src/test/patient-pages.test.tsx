import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../services/queryClient'
import { AuthProvider } from '../context/AuthContext'
import { PatientDirectoryPage } from '../pages/PatientDirectoryPage'
import { PatientOverviewPage } from '../pages/PatientOverviewPage'
import { api } from '../services/api'
import type { PatientSummary, PatientOverview, PatientTimelineResponse } from '../types/patient'

const mockPatients: PatientSummary[] = [
  {
    patient_id: 'PAT-SYN-001',
    mrn: 'SYN-84920',
    name: 'Eleanor Vance',
    date_of_birth: '1968-04-12',
    gender: 'Female',
    hospital_ids: ['HOSP-METRO-01', 'HOSP-VALLEY-02'],
    care_team_ids: ['CT-INTERNAL-B', 'CT-CARDIO-A'],
    allergies: ['Penicillin', 'Sulfa drugs'],
    active_consent: true,
  },
]

const mockOverview: PatientOverview = {
  patient_id: 'PAT-SYN-001',
  mrn: 'SYN-84920',
  name: 'Eleanor Vance',
  date_of_birth: '1968-04-12',
  gender: 'Female',
  blood_type: 'A+',
  allergies: ['Penicillin', 'Sulfa drugs'],
  hospital_ids: ['HOSP-METRO-01', 'HOSP-VALLEY-02'],
  hospitals: [
    { hospital_id: 'HOSP-METRO-01', name: 'Metro Health University Medical Center', region: 'Region North' },
    { hospital_id: 'HOSP-VALLEY-02', name: 'Valley Memorial Community Hospital', region: 'Region South' },
  ],
  care_team_ids: ['CT-INTERNAL-B', 'CT-CARDIO-A'],
  care_teams: [
    { care_team_id: 'CT-INTERNAL-B', care_team_name: 'Internal Medicine Team B', role: 'Senior Verifier' },
  ],
  active_consent: true,
  encounters_count: 3,
  verified_records_count: 0,
  pending_records_count: 0,
}

const mockTimeline: PatientTimelineResponse = {
  patient_id: 'PAT-SYN-001',
  mrn: 'SYN-84920',
  total_events: 1,
  events: [
    {
      event_id: 'ENC-2026-081',
      event_type: 'clinical_encounter',
      timestamp: '2026-10-15 08:30',
      title: 'Inpatient Admission - Cardiology',
      department: 'Cardiology',
      hospital_name: 'Metro Health University Medical Center',
      status: 'completed',
      details: {
        chief_complaint: 'Palpitations and shortness of breath upon exertion.',
        attending_doctor_name: 'Dr. Marcus Vance',
        discharge_date: '2026-10-18 14:00',
        diagnosis_codes: ['I48.0 (Paroxysmal atrial fibrillation)'],
      },
    },
  ],
}

describe('Patient Directory & Overview Components', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.restoreAllMocks()
  })

  it('renders patient directory table with scoped records', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce(mockPatients)

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/patients']}>
            <PatientDirectoryPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Patient Directory/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search by MRN or patient name/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('SYN-84920')).toBeInTheDocument()
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
      expect(screen.getByText(/Penicillin, Sulfa drugs/i)).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
  })

  it('renders patient overview with dual-hospital links, timeline, and empty verified/pending sections', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/timeline')) {
        return mockTimeline
      }
      return mockOverview
    })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/patients/PAT-SYN-001']}>
            <Routes>
              <Route path="/patients/:id" element={<PatientOverviewPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Eleanor Vance')).toBeInTheDocument()
      expect(screen.getByText(/SYN-84920/)).toBeInTheDocument()
      expect(screen.getByText(/Blood Type:/i)).toBeInTheDocument()
      expect(screen.getByText('A+')).toBeInTheDocument()
      expect(screen.getAllByText(/Metro Health University Medical Center/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/Valley Memorial Community Hospital/i)).toBeInTheDocument()
    })

    // Check Timeline Event
    expect(screen.getByText(/Inpatient Admission - Cardiology/i)).toBeInTheDocument()
    expect(screen.getByText(/Palpitations and shortness of breath upon exertion/i)).toBeInTheDocument()

    // Check Verified vs Pending Sections (strictly empty for now)
    expect(screen.getByText('Verified Records (Trusted Collection)')).toBeInTheDocument()
    expect(screen.getByText('No verified clinical records')).toBeInTheDocument()
    expect(screen.getByText('Pending Review (AI Proposals)')).toBeInTheDocument()
    expect(screen.getByText('No extractions pending review')).toBeInTheDocument()
  })
})
