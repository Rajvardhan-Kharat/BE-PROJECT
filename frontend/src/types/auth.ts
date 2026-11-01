export type UserRole =
  | 'patient'
  | 'doctor'
  | 'senior_doctor'
  | 'hospital_admin'
  | 'system_admin'

export interface UserScope {
  careTeamId?: string
  careTeamName?: string
  hospitalId?: string
  patientId?: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  scope?: UserScope
  consentActive?: boolean
  token: string
}

export interface SyntheticDevAccount {
  role: UserRole
  title: string
  name: string
  email: string
  description: string
  scope: UserScope
}

export const SYNTHETIC_DEV_ACCOUNTS: SyntheticDevAccount[] = [
  {
    role: 'senior_doctor',
    title: 'Senior Doctor (Verifier)',
    name: 'Dr. Sarah Lin',
    email: 'dr.sarah@synthetic.vericare.internal',
    description: 'Care team verifier with authority to approve/reject AI proposals.',
    scope: { careTeamId: 'CT-INTERNAL-B', careTeamName: 'Internal Medicine Team B' },
  },
  {
    role: 'doctor',
    title: 'Attending Physician',
    name: 'Dr. Marcus Vance',
    email: 'dr.marcus@synthetic.vericare.internal',
    description: 'Care team clinician authoring clinical notes and reviewing patient data.',
    scope: { careTeamId: 'CT-INTERNAL-B', careTeamName: 'Internal Medicine Team B' },
  },
  {
    role: 'patient',
    title: 'Patient',
    name: 'Eleanor Vance',
    email: 'patient.eleanor@synthetic.vericare.internal',
    description: 'Patient viewing synthetic health record and consent allocations.',
    scope: { patientId: 'SYN-84920' },
  },
  {
    role: 'hospital_admin',
    title: 'Hospital Administrator',
    name: 'David Chen',
    email: 'admin.david@synthetic.vericare.internal',
    description: 'Hospital administrator monitoring audit logs and compliance.',
    scope: { hospitalId: 'HOSP-METRO-01' },
  },
  {
    role: 'system_admin',
    title: 'System Administrator',
    name: 'Alex Mercer',
    email: 'sys.alex@synthetic.vericare.internal',
    description: 'Infrastructure administrator managing platform security and Aria adapters.',
    scope: {},
  },
]
