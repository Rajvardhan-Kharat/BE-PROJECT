export interface NoteCitation {
  record_id: string
  record_type: string
  date: string
  snippet: string
}

export interface ClinicalNote {
  note_id: string
  patient_id: string
  author_id: string
  author_name: string
  author_role: string
  specialty: string
  title: string
  content: string
  is_private: boolean
  tags: string[]
  citations: NoteCitation[]
  created_at: string
  updated_at: string
}

export interface CitedSummaryRecordRef {
  note_id: string
  author_name: string
  specialty: string
  date: string
  snippet: string
}

export interface CitedSummaryResponse {
  patient_id: string
  date_range: {
    from?: string | null
    to?: string | null
  }
  topic_filter?: string | null
  summary_text: string
  cited_records: CitedSummaryRecordRef[]
  total_notes_analyzed: number
  generated_at: string
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface ClinicalTask {
  task_id: string
  patient_id: string
  title: string
  description?: string
  assigned_to: string
  assigned_to_name: string
  assigned_by: string
  assigned_by_name: string
  priority: TaskPriority
  due_date: string
  status: TaskStatus
  completed_at?: string
  created_at: string
  updated_at: string
}

export interface SpecialistQueryResponseItem {
  response_id: string
  doctor_id: string
  doctor_name: string
  specialty: string
  answer: string
  created_at: string
}

export interface SpecialistQuery {
  query_id: string
  patient_id: string
  from_doctor_id: string
  from_doctor_name: string
  from_specialty: string
  to_doctor_id?: string
  to_doctor_name?: string
  to_specialty: string
  subject: string
  question: string
  priority: 'routine' | 'urgent'
  status: 'open' | 'answered' | 'closed'
  responses: SpecialistQueryResponseItem[]
  created_at: string
  updated_at: string
}

export interface InAppNotification {
  notification_id: string
  recipient_id: string
  patient_id?: string
  type: 'task_assigned' | 'specialist_query' | 'query_answered' | 'followup_overdue' | 'note_shared'
  title: string
  message: string
  link?: string
  read: boolean
  created_at: string
}
