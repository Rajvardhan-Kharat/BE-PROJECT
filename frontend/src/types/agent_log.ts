export interface ToolCallRecord {
  tool_name: string
  input_params: Record<string, unknown>
  output_summary: string
  duration_ms: number
}

export type AgentStatus = 'started' | 'success' | 'failed'

export interface AgentRunLog {
  run_id: string
  request_id: string
  agent_name: string
  patient_id?: string | null
  version_id?: string | null
  input_refs: string[]
  tools_called: ToolCallRecord[]
  status: AgentStatus
  execution_summary: string
  started_at: string
  completed_at?: string | null
  duration_ms?: number | null
  error_message?: string | null
}
