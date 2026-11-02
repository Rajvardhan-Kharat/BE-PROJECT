export type ExtractionFieldStatus =
  | 'explicit'
  | 'inferred'
  | 'uncertain'
  | 'missing'
  | 'conflicting'

export interface SourceSpan {
  doc: string
  page: number // 1-indexed
  start: number
  end: number
  quote: string
}

export interface HumanCorrection {
  field_name: string
  original_value: any
  corrected_value: any
  reason: string
  corrected_by?: string
  corrected_at: string
}

export interface ExtractedField {
  field_name: string
  value: any
  confidence_note: string
  status: ExtractionFieldStatus
  source_span?: SourceSpan | null
  grounding_verified?: boolean
  human_correction?: HumanCorrection
}

export interface DocumentPageText {
  page: number
  text: string
}

export interface DocumentExtraction {
  document_id: string
  patient_id: string
  original_filename?: string
  content_hash: string
  status: string // strictly 'pending_review'
  page_count: number
  extracted_text_snippet?: string
  pages?: DocumentPageText[]
  fields: ExtractedField[]
  human_corrections?: HumanCorrection[]
  uploaded_at?: string
  provider_name?: string
  repair_attempts?: number
}

export type ProcessingStatus = 'queued' | 'processing' | 'failed' | 'done'

export interface UploadTask {
  file: File
  patient_id: string
  status: ProcessingStatus
  progress: number // 0 to 100
  document_id?: string
  error?: string
  result?: DocumentExtraction
}
