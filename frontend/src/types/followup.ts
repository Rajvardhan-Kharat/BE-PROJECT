export type FollowUpStatus = 'upcoming' | 'overdue' | 'completed' | 'deferred' | 'needs_review'
export type FollowUpType = 'appointment' | 'medication_course' | 'lab_test' | 'imaging'

export interface MedicationCourseDetails {
  medication_name: string
  dosage: string
  prescribed_days: number
  start_date: string
  expected_end_date: string
  refills_authorized?: number
  instructions?: string
}

export interface StatusTransitionAudit {
  from_status: string
  to_status: string
  reason: string
  changed_by: string
  changed_at: string
}

export interface FollowUpItem {
  follow_up_id: string
  patient_id: string
  type: FollowUpType
  title: string
  description?: string
  due_date: string
  scheduled_date?: string
  completed_date?: string
  status: FollowUpStatus
  days_overdue_or_remaining: number
  care_team_id?: string
  assigned_doctor_id?: string
  medication_details?: MedicationCourseDetails
  adherence_inferred: false
  clinical_safety_note: string
  audit_history: StatusTransitionAudit[]
  created_at: string
  updated_at: string
}

export interface FollowUpEvaluationResult {
  patient_id: string
  evaluation_timestamp: string
  total_tracked: number
  upcoming_count: number
  overdue_count: number
  needs_review_count: number
  completed_count: number
  deferred_count: number
  adherence_inferred: false
  summary: string
}
