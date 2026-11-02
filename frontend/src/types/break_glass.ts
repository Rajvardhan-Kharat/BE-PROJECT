import type { EmergencySummaryResponse } from './emergency_summary'

export type BreakGlassReasonCategory =
  | 'acute_resuscitation'
  | 'unconscious_patient'
  | 'trauma_stat'
  | 'immediate_threat_to_life'
  | 'missing_critical_history'

export type BreakGlassSessionStatus = 'active' | 'expired' | 'revoked'
export type BreakGlassReviewStatus = 'pending_review' | 'justified' | 'questioned'

export interface BreakGlassRequest {
  patient_id: string
  justification: string
  reason_category: BreakGlassReasonCategory
  duration_minutes?: number
}

export interface BreakGlassAdminReviewRequest {
  review_status: 'justified' | 'questioned'
  review_notes: string
}

export type BreakGlassSession = BreakGlassSessionResponse

export interface BreakGlassSessionResponse {
  session_id: string
  patient_id: string
  clinician_id?: string
  doctor_id?: string
  clinician_name?: string
  clinician_role?: string
  hospital_id?: string
  justification: string
  reason_category: BreakGlassReasonCategory
  status?: BreakGlassSessionStatus
  review_status: BreakGlassReviewStatus
  review_notes?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  granted_at?: string
  created_at?: string
  expires_at: string
  remaining_minutes?: number | null
  is_active?: boolean
  access_scope?: string
}

export interface BreakGlassEmergencyViewResponse {
  session_id: string
  patient_id: string
  patient_name: string
  mrn: string
  date_of_birth: string
  blood_type: string
  session_expires_at: string
  remaining_minutes: number
  summary: EmergencySummaryResponse
  allergies: any[]
  active_medications: Record<string, any>[]
  disclaimer: string
}
