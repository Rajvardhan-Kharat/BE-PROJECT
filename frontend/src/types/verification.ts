import type { RecordStatus } from '../components/ui/StatusChip'

export type { RecordStatus }

export type DecisionType = 'approved' | 'rejected' | 'requires_correction'

export interface VerificationQueueItem {
  version_id: string
  record_id: string
  patient_id: string
  patient_name: string
  mrn: string
  version_number: number
  status: RecordStatus
  record_type: string
  title: string
  department: string
  hospital_id: string
  hospital_name?: string
  submitter_name?: string
  submitted_by?: string
  submitted_at: string
  review_reason?: string
  fields_count: number
  has_prior_approved: boolean
}

export interface RecordVersionResponse {
  version_id: string
  record_id: string
  patient_id: string
  version_number: number
  status: RecordStatus
  record_type: string
  title: string
  department: string
  hospital_id: string
  care_team_id?: string
  data: Record<string, any>
  source_document_id?: string
  source_text_snippet?: string
  extracted_fields: any[]
  submitted_by?: string
  submitter_name?: string
  submitted_at: string
  reviewed_by?: string
  reviewer_name?: string
  reviewed_at?: string
  review_decision?: string
  review_reason?: string
  superseded_by?: string
  superseded_at?: string
  clinical_timestamp?: string
  created_at: string
}

export interface FieldDiff {
  field: string
  current_val: any
  proposed_val: any
  change_type: 'added' | 'modified' | 'unchanged' | 'removed'
}

export interface RecordComparisonResponse {
  proposed_version: RecordVersionResponse
  current_approved_version?: RecordVersionResponse | null
  patient_name: string
  mrn: string
  hospital_name: string
  field_diffs: FieldDiff[]
  can_current_user_approve: boolean
  restriction_reason?: string | null
}

export interface RecordHistoryItem {
  version_id: string
  record_id: string
  version_number: number
  status: RecordStatus
  title: string
  data: Record<string, any>
  submitted_by?: string
  submitter_name?: string
  submitted_at: string
  reviewed_by?: string
  reviewer_name?: string
  reviewed_at?: string
  review_decision?: string
  review_reason?: string
  superseded_by?: string
  superseded_at?: string
}

export interface RecordHistoryResponse {
  record_id: string
  patient_id: string
  patient_name: string
  total_versions: number
  versions: RecordHistoryItem[]
}
