import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Cpu,
  RefreshCw,
  Search,
  Terminal,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { StatusChip } from '../components/ui/StatusChip'
import { EmptyState } from '../components/ui/EmptyState'
import { Banner } from '../components/ui/Banner'
import type { AgentRunLog, ToolCallRecord } from '../types/agent_log'

export const AgentExecutionLogsPage: React.FC = () => {
  const [agentFilter, setAgentFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const {
    data: logs = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<AgentRunLog[]>({
    queryKey: ['agent_runs', agentFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (agentFilter !== 'ALL') {
        params.append('agent_name', agentFilter)
      }
      const queryStr = params.toString() ? `?${params.toString()}` : ''
      return await api.get<AgentRunLog[]>(`/agent-runs${queryStr}`)
    },
  })

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      log.request_id?.toLowerCase().includes(term) ||
      log.run_id?.toLowerCase().includes(term) ||
      log.agent_name?.toLowerCase().includes(term) ||
      log.patient_id?.toLowerCase().includes(term) ||
      log.version_id?.toLowerCase().includes(term)
    )
  })

  const toggleExpand = (runId: string) => {
    setExpandedRunId(expandedRunId === runId ? null : runId)
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-teal-800" />
            <h1 className="text-lg font-bold text-slate-900">Agent Execution Logs</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic governance audit of agent invocations, tool chains, input provenance, and durations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refetch()}
            loading={isRefetching}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Logs
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by request ID, patient ID, run ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            Agent:
          </span>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            aria-label="Filter by agent type"
            className="text-xs bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-700"
          >
            <option value="ALL">All Agents</option>
            <option value="verification_assistant">Verification Assistant</option>
            <option value="emergency_summary_agent">Emergency Summary Agent</option>
            <option value="extraction_service">Document Extraction</option>
          </select>
        </div>
      </div>

      {isError && (
        <Banner variant="critical">
          Failed to load execution logs: {error instanceof Error ? error.message : 'Unknown error'}.
        </Banner>
      )}

      {/* Logs Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading agent execution logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Terminal className="w-5 h-5 text-slate-400" />}
              title="No execution logs found"
              description="No agent runs matching current filter criteria have been recorded."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                <tr>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Agent Name</th>
                  <th className="py-2.5 px-3">Request ID / Run ID</th>
                  <th className="py-2.5 px-3">Subject Ref</th>
                  <th className="py-2.5 px-3">Tools Called</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Started At</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedRunId === log.run_id
                  return (
                    <React.Fragment key={log.run_id}>
                      <tr
                        onClick={() => toggleExpand(log.run_id)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-slate-50/80' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-sans">
                          <StatusChip
                            status={
                              log.status === 'success'
                                ? 'approved'
                                : log.status === 'failed'
                                ? 'rejected'
                                : 'pending_review'
                            }
                            label={log.status.toUpperCase()}
                          />
                        </td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                          {log.agent_name}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-slate-800">{log.request_id}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{log.run_id}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          {log.patient_id && (
                            <span className="block text-slate-700">Pat: {log.patient_id}</span>
                          )}
                          {log.version_id && (
                            <span className="block text-slate-500 text-[10px]">
                              Ver: {log.version_id}
                            </span>
                          )}
                          {!log.patient_id && !log.version_id && (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px]">
                              {log.tools_called.length} tools
                            </span>
                            {log.tools_called.slice(0, 2).map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-mono"
                              >
                                {t.tool_name}
                              </span>
                            ))}
                            {log.tools_called.length > 2 && (
                              <span className="text-slate-400 text-[10px]">
                                +{log.tools_called.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {log.duration_ms !== null && log.duration_ms !== undefined
                            ? `${log.duration_ms} ms`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-sans text-[11px]">
                          {new Date(log.started_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            className="p-1 rounded text-slate-400 hover:text-slate-700"
                            aria-label={isExpanded ? 'Collapse log row' : 'Expand log row'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 inline" />
                            ) : (
                              <ChevronDown className="w-4 h-4 inline" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Trace Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={8} className="p-4 space-y-3 font-sans text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Execution Summary & Input Refs */}
                              <div className="space-y-2">
                                <div>
                                  <h4 className="font-semibold text-slate-800 text-xs">
                                    Execution Summary
                                  </h4>
                                  <p className="text-slate-600 bg-white border border-slate-200 p-2.5 rounded text-[11px] leading-relaxed mt-1">
                                    {log.execution_summary || 'No summary provided.'}
                                  </p>
                                </div>

                                {log.input_refs && log.input_refs.length > 0 && (
                                  <div>
                                    <h4 className="font-semibold text-slate-800 text-xs mb-1">
                                      Input References
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                      {log.input_refs.map((ref, idx) => (
                                        <span
                                          key={idx}
                                          className="font-mono text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                                        >
                                          {ref}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {log.error_message && (
                                  <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                                    <strong className="block font-semibold">Error Message:</strong>
                                    <span className="font-mono text-[11px]">{log.error_message}</span>
                                  </div>
                                )}
                              </div>

                              {/* Tool Call Breakdown */}
                              <div className="space-y-1.5">
                                <h4 className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                                  <Terminal className="w-3.5 h-3.5 text-teal-700" />
                                  Tool Invocations ({log.tools_called.length})
                                </h4>
                                {log.tools_called.length === 0 ? (
                                  <div className="text-slate-400 text-2xs italic">
                                    No external tools invoked during this run.
                                  </div>
                                ) : (
                                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {log.tools_called.map((tool: ToolCallRecord, tIdx: number) => (
                                      <div
                                        key={tIdx}
                                        className="bg-white border border-slate-200 rounded p-2.5 text-xs space-y-1"
                                      >
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-mono font-semibold text-teal-900">
                                            {tool.tool_name}
                                          </span>
                                          <span className="font-mono text-slate-400 text-[10px]">
                                            {tool.duration_ms} ms
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded font-mono">
                                          {tool.output_summary}
                                        </div>
                                        {tool.input_params && Object.keys(tool.input_params).length > 0 && (
                                          <details className="text-[10px] text-slate-500 font-mono">
                                            <summary className="cursor-pointer hover:text-slate-800">
                                              Input parameters
                                            </summary>
                                            <pre className="p-1 bg-slate-100 rounded mt-1 overflow-x-auto">
                                              {JSON.stringify(tool.input_params, null, 2)}
                                            </pre>
                                          </details>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
