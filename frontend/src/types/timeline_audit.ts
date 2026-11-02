export type ConflictType =
  | 'stale_import_reintroduction'
  | 'medication_status_contradiction'
  | 'dosing_inconsistency'
  | 'date_inconsistency'
  | 'duplicate_order'

export type ConflictStatus = 'unresolved' | 'resolved'

export interface ConflictEventRef {
  event_id: string
  event_type: string
  date: string
  source: string
  hospital_id: string
  hospital_name: string
  department: string
  provider_name?: string | null
  status: string
  details?: Record<string, unknown>
}

export interface ConflictMarker {
  conflict_id: string
  rule_id: string
  label: string
  type: ConflictType
  explanation: string
  warning: string
}

export interface TimelineConflict {
  conflict_id: string
  patient_id: string
  conflict_type: ConflictType
  rule_id: string
  entity_key: string
  title: string
  explanation: string
  warning: string
  dates: string[]
  sources: string[]
  events_involved: ConflictEventRef[]
  status: ConflictStatus
  resolution?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
  resolved_reason?: string | null
  created_at: string
  updated_at: string
}

export interface AuditedTimelineEvent {
  event_id: string
  event_type: string
  timestamp: string
  title: string
  department: string
  hospital_id: string
  hospital_name: string
  provider_name?: string | null
  status: string
  has_conflict: boolean
  conflict_markers: ConflictMarker[]
  details: Record<string, unknown>
}

export interface TimelineAuditReport {
  patient_id: string
  mrn: string
  patient_name: string
  total_events: number
  conflicts_count: number
  unresolved_conflicts_count: number
  hospitals_involved: Array<{ hospital_id: string; name: string }>
  departments_involved: string[]
  conflicts: TimelineConflict[]
  timeline: AuditedTimelineEvent[]
}

export interface TimelineConflictResolveRequest {
  resolution_action: string
  reason: string
}
