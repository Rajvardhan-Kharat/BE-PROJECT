export type AlertType = 'data_inconsistency' | 'potential_clinical_concern'
export type AlertStatus = 'open' | 'dismissed' | 'resolved'

export interface AlertEvidenceRef {
  ref_type: string
  ref_id: string
  description: string
  data?: Record<string, unknown> | null
}

export interface ClinicalAlert {
  alert_id: string
  patient_id: string
  rule_id: string
  rule_version: string
  source: string
  type: AlertType
  title: string
  evidence_refs: AlertEvidenceRef[]
  explanation: string
  status: AlertStatus
  dismissed_by?: string | null
  dismissed_reason?: string | null
  dismissed_at?: string | null
  resolved_by?: string | null
  resolved_reason?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
}

export interface Prescription {
  prescription_id: string
  patient_id: string
  encounter_id?: string | null
  record_id?: string | null
  drug_name: string
  dosage: string
  frequency: string
  route: string
  duration_days?: number | null
  status: 'active' | 'discontinued' | 'completed' | 'held'
  start_date?: string | null
  end_date?: string | null
  prescribed_by?: string | null
  hospital_id?: string | null
  notes?: string | null
  created_at?: string | null
}

export interface SafetyCheckResult {
  patient_id: string
  rules_evaluated: number
  rule_set_label: string
  rule_set_version: string
  total_alerts: number
  new_alerts: number
  alerts: ClinicalAlert[]
}

export interface AlertActionPayload {
  reason: string
}
