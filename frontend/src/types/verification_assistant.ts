export type SuggestionType = 'approve' | 'reject' | 'requires_correction'

export interface FieldDiff {
  field_name: string
  old_value?: any
  proposed_value?: any
  is_changed: boolean
  is_new: boolean
}

export interface EvidenceItem {
  field_name: string
  doc_id?: string | null
  page?: number | null
  quote?: string | null
  confidence_note?: string | null
}

export interface PriorConflict {
  conflict_id: string
  field_name: string
  prior_record_id: string
  prior_value: any
  proposed_value: any
  explanation: string
}

export interface VerificationAssistantResponse {
  version_id: string
  record_id: string
  patient_id: string
  missing_fields: string[]
  uncertain_fields: string[]
  conflicts_with_prior: PriorConflict[]
  old_vs_proposed_values: FieldDiff[]
  evidence: EvidenceItem[]
  reviewer_summary: string
  suggestion: SuggestionType
  suggestion_rationale: string
  disclaimer: string
  agent_run_id: string
}
