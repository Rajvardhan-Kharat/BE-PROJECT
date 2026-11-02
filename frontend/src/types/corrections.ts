export interface FieldTypeCorrectionMetric {
  field_type: string
  total_reviewed: number
  corrections_count: number
  correction_rate: number
  common_reasons: string[]
}

export interface TopReasonMetric {
  reason: string
  count: number
  field_type?: string
}

export interface CorrectionDashboardMetrics {
  total_documents_reviewed: number
  total_fields_reviewed: number
  total_corrections: number
  overall_correction_rate: number
  accepted_unchanged_share: number
  avg_review_time_seconds: number
  by_field_type: FieldTypeCorrectionMetric[]
  top_reasons: TopReasonMetric[]
  synthetic_benchmark_notice: string
  last_calculated_at: string
}
