export interface AriaNoticeStatus {
  acknowledged: boolean
  provider_label: string
  mode: 'mock' | 'http' | string
  disclaimer_text: string
}

export interface AriaMessage {
  message_id: string
  session_ref: string
  patient_id: string
  sender: 'user' | 'companion' | 'system'
  text: string
  safety_event: boolean
  provider_name: string
  created_at: string
}

export interface AriaSession {
  session_ref: string
  patient_id: string
  title: string
  status: 'active' | 'archived' | 'deleted' | string
  created_at: string
  updated_at: string
}

export interface AriaCrisisResource {
  name: string
  helpline: string
  description: string
  url: string
}

export interface AriaSendMessageResponse {
  user_message: AriaMessage
  reply_message: AriaMessage
  safety_event: boolean
  crisis_resources?: AriaCrisisResource[]
}

export interface AriaSharedSummary {
  summary_id: string
  patient_id: string
  session_ref: string
  recipient_id: string
  recipient_name?: string
  approved_text: string
  created_at: string
  status: 'active' | 'revoked' | string
  revoked_at?: string
}

export interface AriaDraftSummaryResponse {
  draft_text: string
  session_ref: string
}

export interface AriaHealthResponse {
  status: string
  mode: 'mock' | 'http' | string
  provider_label: string
  companion_available: boolean
}
