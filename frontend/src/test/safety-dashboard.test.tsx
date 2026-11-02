import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MedicationSafetyPage } from '../pages/MedicationSafetyPage'
import { AlertActionModal } from '../components/safety/AlertActionModal'
import { api } from '../services/api'
import type { ClinicalAlert, Prescription } from '../types/safety'

const mockPatient = {
  patient_id: 'PAT-SYN-001',
  mrn: 'SYN-84920',
  name: 'Eleanor Vance',
  date_of_birth: '1974-06-12',
  gender: 'Female',
  blood_type: 'A+',
  active_consent: true,
  allergies: ['Penicillin', 'Sulfa drugs'],
  hospitals: [{ hospital_id: 'HOSP-METRO-01', name: 'Metro Health' }],
  care_teams: [{ care_team_id: 'CT-METRO-CARDIO', care_team_name: 'Cardiology Care Team', role: 'Attending' }],
  encounters_count: 3,
}

const mockAlerts: ClinicalAlert[] = [
  {
    alert_id: 'ALT-SYN-001',
    patient_id: 'PAT-SYN-001',
    rule_id: 'ALLERGY-CONTRA-001',
    rule_version: '1.0.0',
    source: 'Synthetic Demonstration Catalog / Allergy Contraindications',
    type: 'potential_clinical_concern',
    title: 'Severe Allergy Contraindication: Penicillin vs Amoxicillin',
    evidence_refs: [
      {
        ref_type: 'allergy',
        ref_id: 'ALLERGY-PENICILLIN',
        description: 'Documented patient allergy to penicillin class',
      },
      {
        ref_type: 'prescription',
        ref_id: 'RX-SYN-099',
        description: 'Active prescription: Amoxicillin 500 mg TID',
      },
    ],
    explanation: 'Prescribed medication Amoxicillin belongs to the penicillin class, to which patient has documented allergy.',
    status: 'open',
    created_at: '2026-10-30T10:00:00Z',
    updated_at: '2026-10-30T10:00:00Z',
  },
  {
    alert_id: 'ALT-SYN-002',
    patient_id: 'PAT-SYN-001',
    rule_id: 'DUP-RX-001',
    rule_version: '1.0.0',
    source: 'Synthetic Demonstration Catalog / Duplicate Therapy',
    type: 'data_inconsistency',
    title: 'Duplicate Active Prescription: Lisinopril',
    evidence_refs: [
      {
        ref_type: 'prescription',
        ref_id: 'RX-SYN-002',
        description: 'Active prescription: Lisinopril 10mg daily',
      },
      {
        ref_type: 'prescription',
        ref_id: 'RX-SYN-003',
        description: 'Active prescription: Zestril 20mg daily',
      },
    ],
    explanation: 'Concurrent active prescriptions detected for the same generic medication entity.',
    status: 'open',
    created_at: '2026-10-30T10:00:00Z',
    updated_at: '2026-10-30T10:00:00Z',
  },
]

const mockPrescriptions: Prescription[] = [
  {
    prescription_id: 'RX-SYN-001',
    patient_id: 'PAT-SYN-001',
    drug_name: 'Metoprolol Succinate',
    dosage: '25 mg',
    frequency: 'BID',
    route: 'PO',
    status: 'active',
    duration_days: null,
    hospital_id: 'HOSP-METRO-01',
  },
  {
    prescription_id: 'RX-SYN-002',
    patient_id: 'PAT-SYN-001',
    drug_name: 'Lisinopril',
    dosage: '10 mg',
    frequency: 'daily',
    route: 'PO',
    status: 'active',
    duration_days: null,
    hospital_id: 'HOSP-METRO-01',
  },
]

const renderWithProviders = (initialRoute = '/patients/PAT-SYN-001/safety') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/patients/:id/safety" element={<MedicationSafetyPage />} />
          <Route path="/safety" element={<MedicationSafetyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Medication and Safety Conflict Dashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/patients/PAT-SYN-001/safety/alerts')) {
        return mockAlerts
      }
      if (url.includes('/patients/PAT-SYN-001/prescriptions')) {
        return mockPrescriptions
      }
      if (url.includes('/patients/PAT-SYN-001')) {
        return mockPatient
      }
      return []
    })
  })

  it('renders clinical safety header, rules banner, and metric cards', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText(/Medication & Safety Conflict Engine/i)).toBeInTheDocument()
      expect(screen.getByText(/Deterministic Clinical Rules Engine \(v1.0.0\)/i)).toBeInTheDocument()
    })

    // Verify patient MRN and name loaded asynchronously
    expect(await screen.findByText(/Eleanor Vance/i)).toBeInTheDocument()

    // Metrics
    expect(screen.getAllByText(/Active Prescriptions/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Open Clinical Alerts/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Clinical Concerns/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Data Inconsistencies/i).length).toBeGreaterThan(0)
  })

  it('renders deterministic rule IDs, types, and explanations without invented severity scores', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('ALLERGY-CONTRA-001')).toBeInTheDocument()
      expect(screen.getByText('DUP-RX-001')).toBeInTheDocument()
    })

    // Verify rule type indicators
    expect(screen.getByText('Potential Clinical Concern')).toBeInTheDocument()
    expect(screen.getByText('Data Inconsistency')).toBeInTheDocument()

    // STRICT CONSTRAINT CHECK: No invented severity scores on alert models or cards
    mockAlerts.forEach((alert) => {
      expect(alert).not.toHaveProperty('severity')
      expect(alert).not.toHaveProperty('severity_score')
      expect(alert).not.toHaveProperty('risk_level')
    })
    expect(screen.queryByText(/high severity/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/critical severity/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/low severity/i)).not.toBeInTheDocument()
  })

  it('renders clinical evidence references and toggles expansion', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getAllByText(/Clinical Evidence References/i).length).toBeGreaterThan(0)
    })

    // Click first evidence references toggle
    const toggleBtns = screen.getAllByText(/Clinical Evidence References/i)
    fireEvent.click(toggleBtns[0])

    await waitFor(() => {
      expect(screen.getByText(/Documented patient allergy to penicillin class/i)).toBeInTheDocument()
      expect(screen.getByText(/ALLERGY-PENICILLIN/i)).toBeInTheDocument()
    })
  })

  it('renders prescription records table', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('Metoprolol Succinate')).toBeInTheDocument()
      expect(screen.getByText('Lisinopril')).toBeInTheDocument()
    })
  })

  it('dismiss modal enforces mandatory clinical reason validation', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <AlertActionModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        alert={mockAlerts[0]}
        actionType="dismiss"
      />
    )

    expect(screen.getByText(/Dismiss Clinical Safety Alert/i)).toBeInTheDocument()
    expect(screen.getByText(/Rule: ALLERGY-CONTRA-001/i)).toBeInTheDocument()

    // Confirm button is disabled when reason is empty
    const confirmBtn = screen.getByRole('button', { name: /Confirm Dismissal/i })
    expect(confirmBtn).toBeDisabled()

    // Fill valid reason
    const textarea = screen.getByPlaceholderText(/State clinical rationale/i)
    fireEvent.change(textarea, { target: { value: 'Verified penicillin skin test negative at allergy clinic' } })
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith('Verified penicillin skin test negative at allergy clinic')
    })
  })

  it('resolve modal enforces mandatory corrective rationale and calls confirm', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <AlertActionModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        alert={mockAlerts[1]}
        actionType="resolve"
      />
    )

    expect(screen.getByText(/Resolve Clinical Safety Alert/i)).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /Mark Resolved/i })
    expect(confirmBtn).toBeDisabled()

    const textarea = screen.getByPlaceholderText(/State remediation performed/i)
    fireEvent.change(textarea, { target: { value: 'Discontinued duplicate Zestril order; maintained Lisinopril 10mg' } })
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith('Discontinued duplicate Zestril order; maintained Lisinopril 10mg')
    })
  })
})
