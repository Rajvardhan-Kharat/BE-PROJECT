export type AccessType =
  | 'standard'
  | 'break_glass_emergency'
  | 'consent_revocation'
  | 'access_denied'

export interface PatientAccessLogEntry {
  log_id: string
  timestamp: string
  accessor_id?: string | null
  accessor_name?: string | null
  accessor_role?: string | null
  access_type: AccessType
  resource_accessed: string
  purpose?: string | null
  break_glass_justification?: string | null
  break_glass_reason_category?: string | null
  break_glass_session_id?: string | null
  status: string
  ip_address?: string | null
}

export interface PatientAccessLogResponse {
  patient_id: string
  total_accesses: number
  break_glass_accesses_count: number
  entries: PatientAccessLogEntry[]
}

export interface PatientNotificationResponse {
  notification_id: string
  patient_id: string
  type: string
  priority: string
  title: string
  message: string
  read: boolean
  created_at: string
  metadata?: Record<string, any> | null
}
