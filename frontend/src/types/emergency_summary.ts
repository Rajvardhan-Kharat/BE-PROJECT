export interface VerifiedItem {
  category: 'allergies' | 'active_medications' | 'critical_diagnoses' | 'vitals' | string
  label: string
  details: string
  source_record_id: string
  source_version_id: string
  hospital_name: string
  reviewed_by: string
  reviewed_at?: string | null
}

export interface PendingItem {
  category: string
  label: string
  proposed_value: string
  source_version_id: string
  submitted_by: string
  submitted_at: string
  status: string
  quarantine_warning: string
}

export interface ConflictingItem {
  conflict_id: string
  entity: string
  conflict_type: string
  explanation: string
  sources_involved: string[]
  warning: string
}

export interface MissingOrStaleItem {
  category: string
  item_name: string
  status_display: string
  notes: string
  last_known_date?: string | null
}

export interface EmergencySummaryResponse {
  patient_id: string
  mrn: string
  patient_name: string
  date_of_birth: string
  gender: string
  blood_type: string
  last_updated_time: string
  compiled_at: string
  verified: VerifiedItem[]
  pending: PendingItem[]
  conflicting: ConflictingItem[]
  missing_or_stale: MissingOrStaleItem[]
  agent_run_id: string
}
