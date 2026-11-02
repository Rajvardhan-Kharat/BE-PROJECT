import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  HelpCircle,
  FileCheck2,
  ExternalLink,
  Building2,
  HeartPulse,
  RefreshCw,
  Printer,
  ChevronRight,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { StatusChip } from '../components/ui/StatusChip'
import { EmptyState } from '../components/ui/EmptyState'
import type { EmergencySummaryResponse } from '../types/emergency_summary'

export const EmergencySummaryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const patientId = id || 'PAT-SYN-001'

  const [activeTab, setActiveTab] = useState<'all' | 'verified' | 'pending' | 'conflicting' | 'missing'>('all')

  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<EmergencySummaryResponse>({
    queryKey: ['emergency_summary', patientId],
    queryFn: async () => {
      return await api.get<EmergencySummaryResponse>(
        `/patients/${patientId}/emergency-summary`
      )
    },
    enabled: !!patientId,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto py-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="h-24 bg-slate-100 rounded border border-slate-200"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-64 bg-slate-100 rounded"></div>
          <div className="h-64 bg-slate-100 rounded"></div>
        </div>
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-6">
        <Banner variant="critical">
          Failed to load emergency summary: {error instanceof Error ? error.message : 'Unknown error'}.
        </Banner>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* Top Protocol Strip */}
      <div className="bg-slate-900 text-white px-4 py-2 rounded flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-rose-400 animate-pulse" />
          <span className="font-semibold tracking-wide uppercase text-[11px] text-rose-300">
            Emergency Clinical Summary
          </span>
          <span className="text-slate-400 text-2xs">•</span>
          <span className="text-slate-300 text-2xs">
            Compiled: <span className="font-mono">{new Date(summary.compiled_at).toLocaleString()}</span>
          </span>
          <span className="text-slate-400 text-2xs">•</span>
          <span className="text-slate-300 text-2xs">
            Last Clinical Update: <span className="font-mono">{new Date(summary.last_updated_time).toLocaleString()}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-mono">
            Agent Trace: {summary.agent_run_id}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.print()}
            icon={<Printer className="w-3.5 h-3.5 text-slate-300" />}
            className="text-white hover:text-white hover:bg-slate-800"
          >
            Print Summary
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            loading={isRefetching}
            icon={<RefreshCw className="w-3.5 h-3.5 text-slate-300" />}
            className="text-white hover:text-white hover:bg-slate-800"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Patient Demographic Bar */}
      <div className="bg-white border border-slate-200 rounded p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{summary.patient_name}</h1>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
              MRN: {summary.mrn}
            </span>
            <span className="font-mono text-xs text-slate-500">
              ID: {summary.patient_id}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span>DOB: <strong className="font-mono text-slate-800">{summary.date_of_birth}</strong></span>
            <span>•</span>
            <span>Gender: <strong className="capitalize text-slate-800">{summary.gender}</strong></span>
            <span>•</span>
            <span>Blood Group: <strong className="font-mono font-bold text-rose-700">{summary.blood_type}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Link to={`/patients/${summary.patient_id}`}>
            <Button size="sm" variant="secondary" icon={<ExternalLink className="w-3 h-3" />}>
              Patient Chart
            </Button>
          </Link>
          <Link to={`/patients/${summary.patient_id}/timeline`}>
            <Button size="sm" variant="secondary" icon={<Clock className="w-3 h-3" />}>
              Timeline Audit
            </Button>
          </Link>
        </div>
      </div>

      {/* Four Core Clinical Sections Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All 4 Sections
        </button>
        <button
          onClick={() => setActiveTab('verified')}
          className={`px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'verified'
              ? 'bg-emerald-800 text-white'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Verified ({summary.verified.length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'pending'
              ? 'bg-amber-800 text-white'
              : 'text-amber-800 hover:bg-amber-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Pending ({summary.pending.length})
        </button>
        <button
          onClick={() => setActiveTab('conflicting')}
          className={`px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'conflicting'
              ? 'bg-rose-800 text-white'
              : 'text-rose-800 hover:bg-rose-50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Conflicting ({summary.conflicting.length})
        </button>
        <button
          onClick={() => setActiveTab('missing')}
          className={`px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'missing'
              ? 'bg-slate-800 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Missing or Stale ({summary.missing_or_stale.length})
        </button>
      </div>

      {/* Grid of the Four Sections */}
      <div className="space-y-6">
        {/* SECTION 1: VERIFIED */}
        {(activeTab === 'all' || activeTab === 'verified') && (
          <section className="bg-white border border-emerald-300 rounded overflow-hidden shadow-xs">
            <div className="bg-emerald-50 px-4 py-2.5 border-b border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-emerald-950">Verified Clinical Data</h2>
                <span className="text-2xs font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                  {summary.verified.length} approved records
                </span>
              </div>
              <span className="text-[11px] text-emerald-800 font-medium">
                Clinician-reviewed & committed to trusted store
              </span>
            </div>

            {summary.verified.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />}
                  title="No verified records found"
                  description="No approved clinical entities exist yet in this patient's verified timeline."
                />
              </div>
            ) : (
              <div className="divide-y divide-emerald-100">
                {summary.verified.map((item, index) => (
                  <div key={index} className="p-3.5 hover:bg-emerald-50/20 transition-colors text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{item.label}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] uppercase border border-slate-200">
                          {item.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-2xs text-slate-500 font-mono">
                        <span className="flex items-center gap-1 text-slate-700">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {item.hospital_name}
                        </span>
                        <span>•</span>
                        <span>Verifier: {item.reviewed_by}</span>
                        {item.reviewed_at && (
                          <>
                            <span>•</span>
                            <span>{new Date(item.reviewed_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 p-2 rounded font-mono mb-2">
                      {item.details}
                    </div>

                    <div className="flex items-center gap-3 text-2xs text-slate-500">
                      <span>
                        Source Record ID:{' '}
                        <span className="font-mono text-slate-700">{item.source_record_id}</span>
                      </span>
                      <span>•</span>
                      <span>
                        Version:{' '}
                        <span className="font-mono text-slate-700">{item.source_version_id}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SECTION 2: PENDING (QUARANTINED) */}
        {(activeTab === 'all' || activeTab === 'pending') && (
          <section className="bg-white border border-amber-300 rounded overflow-hidden shadow-xs">
            <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700" />
                <h2 className="text-sm font-semibold text-amber-950">Pending Review (Quarantined)</h2>
                <span className="text-2xs font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                  {summary.pending.length} proposals
                </span>
              </div>
              <span className="text-[11px] text-amber-900 font-semibold">
                NEVER treat as verified • Quarantine active
              </span>
            </div>

            {summary.pending.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Clock className="w-5 h-5 text-amber-600" />}
                  title="No pending proposals"
                  description="There are currently no unreviewed records or AI extractions pending verification."
                />
              </div>
            ) : (
              <div className="divide-y divide-amber-100">
                {summary.pending.map((item, index) => (
                  <div key={index} className="p-3.5 bg-amber-50/10 hover:bg-amber-50/30 transition-colors text-xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-950 text-sm">{item.label}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] uppercase border border-amber-200">
                          {item.category}
                        </span>
                        <StatusChip status="pending_review" label={item.status.toUpperCase()} />
                      </div>
                      <div className="text-2xs text-slate-500 font-mono">
                        Submitted by: {item.submitted_by} ({new Date(item.submitted_at).toLocaleDateString()})
                      </div>
                    </div>

                    {/* Quarantine Warning */}
                    <div className="p-2 bg-amber-100/60 border border-amber-300 rounded text-[11px] text-amber-950 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
                      <span>{item.quarantine_warning}</span>
                    </div>

                    <div className="text-xs text-slate-800 bg-white border border-slate-200 p-2 rounded font-mono">
                      <span className="text-slate-400 block text-[10px]">Proposed Value:</span>
                      {item.proposed_value}
                    </div>

                    <div className="flex items-center justify-between text-2xs text-slate-500 pt-1">
                      <span>
                        Version ID: <span className="font-mono text-slate-700">{item.source_version_id}</span>
                      </span>
                      <Link
                        to={`/verification/${item.source_version_id}/compare`}
                        className="text-teal-700 font-medium hover:underline inline-flex items-center gap-1"
                      >
                        Review in Verification Queue
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SECTION 3: CONFLICTING */}
        {(activeTab === 'all' || activeTab === 'conflicting') && (
          <section className="bg-white border border-rose-300 rounded overflow-hidden shadow-xs">
            <div className="bg-rose-50 px-4 py-2.5 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-700" />
                <h2 className="text-sm font-semibold text-rose-950">Conflicting Records</h2>
                <span className="text-2xs font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200">
                  {summary.conflicting.length} cross-facility conflicts
                </span>
              </div>
              <span className="text-[11px] text-rose-900 font-semibold">
                Contradictory clinical data across facilities
              </span>
            </div>

            {summary.conflicting.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ShieldCheck className="w-5 h-5 text-teal-600" />}
                  title="No conflicts detected"
                  description="Cross-hospital timeline and drug safety checks show no active contradictions."
                />
              </div>
            ) : (
              <div className="divide-y divide-rose-100">
                {summary.conflicting.map((item, index) => (
                  <div key={index} className="p-3.5 bg-rose-50/10 hover:bg-rose-50/30 transition-colors text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-950 text-sm">{item.entity}</span>
                        <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200">
                          {item.conflict_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="font-mono text-2xs text-slate-500">
                        Conflict ID: {item.conflict_id}
                      </span>
                    </div>

                    <div className="p-2 bg-rose-100/60 border border-rose-300 rounded text-[11px] text-rose-950 font-semibold flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-800 shrink-0 mt-0.5" />
                      <span>{item.warning}</span>
                    </div>

                    <p className="text-xs text-slate-800 leading-relaxed bg-white border border-slate-200 p-2.5 rounded">
                      {item.explanation}
                    </p>

                    {item.sources_involved && item.sources_involved.length > 0 && (
                      <div className="text-2xs text-slate-600">
                        <span className="font-semibold text-slate-800">Sources Involved: </span>
                        {item.sources_involved.join(' • ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SECTION 4: MISSING OR STALE */}
        {(activeTab === 'all' || activeTab === 'missing') && (
          <section className="bg-white border border-slate-300 rounded overflow-hidden shadow-xs">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-slate-700" />
                <h2 className="text-sm font-semibold text-slate-900">Missing or Stale Information</h2>
                <span className="text-2xs font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300">
                  {summary.missing_or_stale.length} items
                </span>
              </div>
              <span className="text-[11px] text-slate-600 font-medium">
                Missing is never negative ("information unavailable")
              </span>
            </div>

            {summary.missing_or_stale.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<FileCheck2 className="w-5 h-5 text-slate-500" />}
                  title="No missing or stale items"
                  description="All essential clinical data categories have fresh verified records."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.missing_or_stale.map((item, index) => (
                  <div key={index} className="p-3.5 hover:bg-slate-50 transition-colors text-xs space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{item.item_name}</span>
                        <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {item.category}
                        </span>
                      </div>
                      <span className="font-mono text-2xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                        {item.status_display}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700 leading-relaxed">
                      {item.notes}
                    </div>

                    {item.last_known_date && (
                      <div className="text-2xs text-slate-500 font-mono">
                        Last Known Date: {item.last_known_date}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
