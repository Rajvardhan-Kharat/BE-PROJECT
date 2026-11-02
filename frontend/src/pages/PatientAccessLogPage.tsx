import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Eye,
  ShieldAlert,
  RefreshCw,
  Search,
  Filter,
  ShieldX,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { StatusChip } from '../components/ui/StatusChip'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import type { PatientAccessLogResponse } from '../types/access_log'

export const PatientAccessLogPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const patientId = id || user?.scope?.patientId || 'PAT-SYN-001'

  const [accessFilter, setAccessFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  const {
    data: accessLog,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<PatientAccessLogResponse>({
    queryKey: ['patient_access_log', patientId],
    queryFn: async () => {
      return await api.get<PatientAccessLogResponse>(`/patients/${patientId}/access-log`)
    },
  })

  const entries = accessLog?.entries || []

  const filteredEntries = entries.filter((entry) => {
    if (accessFilter !== 'ALL' && entry.access_type !== accessFilter) return false
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      entry.accessor_id?.toLowerCase().includes(term) ||
      entry.accessor_name?.toLowerCase().includes(term) ||
      entry.resource_accessed?.toLowerCase().includes(term) ||
      entry.purpose?.toLowerCase().includes(term) ||
      entry.break_glass_justification?.toLowerCase().includes(term)
    )
  })

  const toggleExpand = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId)
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-teal-800" />
            <h1 className="text-lg font-bold text-slate-900">Patient Data Access Audit Log</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Transparent and immutable access history for Patient{' '}
            <span className="font-mono text-slate-800 font-semibold">{patientId}</span>.
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
            Refresh Log
          </Button>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      {accessLog && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-white border border-slate-200 rounded">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
              Total Access Events
            </span>
            <span className="text-xl font-bold font-mono text-slate-900">{accessLog.total_accesses}</span>
          </div>

          <div className="p-3 bg-rose-50/50 border border-rose-200 rounded">
            <span className="text-2xs font-semibold text-rose-800 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Emergency Break-Glass Overrides
            </span>
            <span className="text-xl font-bold font-mono text-rose-950">
              {accessLog.break_glass_accesses_count}
            </span>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
              Governance Status
            </span>
            <span className="text-xs font-semibold text-teal-800 flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              Backend Enforced & Audited
            </span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by clinician, resource, justification..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Type:
          </span>
          <select
            value={accessFilter}
            onChange={(e) => setAccessFilter(e.target.value)}
            aria-label="Filter by access type"
            className="text-xs bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-700"
          >
            <option value="ALL">All Access Events</option>
            <option value="break_glass_emergency">Break-Glass Emergency Overrides</option>
            <option value="standard">Standard Clinician Reads</option>
            <option value="consent_revocation">Consent Revocations</option>
            <option value="access_denied">Access Denials (403)</option>
          </select>
        </div>
      </div>

      {isError && (
        <Banner variant="critical">
          Failed to load patient access log: {error instanceof Error ? error.message : 'Unknown error'}.
        </Banner>
      )}

      {/* Access Log Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading access log...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Eye className="w-5 h-5 text-slate-400" />}
              title="No access events found"
              description="No data access records match the selected filter criteria."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                <tr>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Accessor</th>
                  <th className="py-2.5 px-3">Resource</th>
                  <th className="py-2.5 px-3">Purpose / Category</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredEntries.map((entry) => {
                  const isBreakGlass = entry.access_type === 'break_glass_emergency'
                  const isDenied = entry.access_type === 'access_denied'
                  const isExpanded = expandedLogId === entry.log_id

                  return (
                    <React.Fragment key={entry.log_id}>
                      <tr
                        onClick={() => toggleExpand(entry.log_id)}
                        className={`cursor-pointer transition-colors ${
                          isBreakGlass
                            ? 'bg-rose-50/40 hover:bg-rose-50/70'
                            : isDenied
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-sans">
                          {isBreakGlass ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 font-semibold text-[10px]">
                              <ShieldAlert className="w-3 h-3 text-rose-700" />
                              BREAK-GLASS
                            </span>
                          ) : isDenied ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-medium text-[10px]">
                              <ShieldX className="w-3 h-3 text-amber-700" />
                              DENIED
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                              STANDARD
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-sans">
                          <div className="font-semibold text-slate-900">
                            {entry.accessor_name || entry.accessor_id || 'System'}
                          </div>
                          <div className="text-[10px] text-slate-400 capitalize">
                            {entry.accessor_role || 'Unknown role'}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-slate-700">
                          {entry.resource_accessed}
                        </td>

                        <td className="py-2.5 px-3 font-sans text-slate-800">
                          {entry.break_glass_reason_category ? (
                            <span className="font-semibold text-rose-950 capitalize">
                              {entry.break_glass_reason_category.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            entry.purpose || '—'
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-slate-500 font-sans text-[11px]">
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>

                        <td className="py-2.5 px-3 font-sans">
                          <StatusChip
                            status={
                              entry.status === 'SUCCESS' || entry.status === 'active'
                                ? 'approved'
                                : entry.status === 'DENIED'
                                ? 'rejected'
                                : 'pending_review'
                            }
                            label={entry.status.toUpperCase()}
                          />
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            className="p-1 rounded text-slate-400 hover:text-slate-700"
                            aria-label={isExpanded ? 'Collapse entry' : 'Expand entry'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 inline" />
                            ) : (
                              <ChevronDown className="w-4 h-4 inline" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Justification and IP Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={7} className="p-4 space-y-2 font-sans text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-semibold text-slate-800 text-xs mb-1">
                                  {isBreakGlass ? 'Clinical Justification' : 'Access Context'}
                                </h4>
                                <p className="p-2.5 bg-white border border-slate-200 rounded text-[11px] leading-relaxed text-slate-800 font-mono">
                                  {entry.break_glass_justification ||
                                    entry.purpose ||
                                    'Standard clinical review.'}
                                </p>
                              </div>

                              <div className="space-y-1 text-2xs text-slate-600 font-mono">
                                {entry.break_glass_session_id && (
                                  <div>
                                    <span className="text-slate-400">Session ID: </span>
                                    <span className="font-semibold">{entry.break_glass_session_id}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-400">Accessor ID: </span>
                                  <span>{entry.accessor_id || 'System'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Client IP: </span>
                                  <span>{entry.ip_address || 'Internal Network'}</span>
                                </div>
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
