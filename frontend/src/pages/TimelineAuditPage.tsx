import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { TimelineAuditReport, TimelineConflict } from '../types/timeline_audit'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import { TimelineConflictResolutionModal } from '../components/timeline/TimelineConflictResolutionModal'
import {
  History,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Building2,
  Calendar,
  Pill,
  ArrowLeft,
  User,
  Filter,
} from 'lucide-react'

export const TimelineAuditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const patientId = id || 'PAT-SYN-001'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Filters
  const [selectedHospital, setSelectedHospital] = useState<string>('all')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [selectedEventType, setSelectedEventType] = useState<string>('all')
  const [conflictOnly, setConflictOnly] = useState<boolean>(false)

  // Modal State
  const [activeConflict, setActiveConflict] = useState<TimelineConflict | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  // 2. Fetch Timeline Audit Report
  const {
    data: report,
    isLoading,
    isError,
    error,
  } = useQuery<TimelineAuditReport>({
    queryKey: [
      'timeline_audit',
      patientId,
      selectedHospital,
      selectedDepartment,
      selectedEventType,
      conflictOnly,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (selectedHospital !== 'all') params.hospital_id = selectedHospital
      if (selectedDepartment !== 'all') params.department = selectedDepartment
      if (selectedEventType !== 'all') params.event_type = selectedEventType
      if (conflictOnly) params.conflict_only = 'true'
      const queryStr = new URLSearchParams(params).toString()
      return api.get<TimelineAuditReport>(
        `/patients/${patientId}/timeline/audit${queryStr ? `?${queryStr}` : ''}`
      )
    },
    enabled: !!patientId,
  })

  const handleOpenResolve = (conflict: TimelineConflict) => {
    setActiveConflict(conflict)
    setIsModalOpen(true)
  }

  const handleConfirmResolve = async (action: string, reason: string) => {
    if (!activeConflict) return
    await api.post(`/timeline/conflicts/${activeConflict.conflict_id}/resolve`, {
      resolution_action: action,
      reason,
    })
    await queryClient.invalidateQueries({ queryKey: ['timeline_audit', patientId] })
    setSuccessBanner(
      `Conflict ${activeConflict.rule_id} successfully resolved with audited rationale.`
    )
    setTimeout(() => setSuccessBanner(null), 5000)
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 max-w-xl mx-auto">
        <div className="inline-block animate-spin w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full mb-3" />
        <div className="font-semibold text-slate-700">Evaluating Cross-Facility Timeline Conflicts...</div>
        <div className="text-2xs text-slate-400 mt-1">Aggregating encounters, prescriptions, and external imports</div>
      </div>
    )
  }

  if (isError || !report) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-6">
        <Banner variant="critical" title="Timeline Audit Error">
          {error instanceof Error ? error.message : 'Failed to load timeline conflict audit report.'}
        </Banner>
        <Button
          size="sm"
          variant="secondary"
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          onClick={() => navigate(`/patients/${patientId}`)}
        >
          Return to Patient Record
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
            onClick={() => navigate(`/patients/${patientId}`)}
          >
            Back to Patient
          </Button>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <History className="w-4 h-4 text-teal-800" />
              Cross-Facility Timeline Conflict Audit
            </h1>
            <p className="text-2xs text-slate-500 font-mono">
              Patient: {report.patient_name} (MRN: {report.mrn}) • Dual-Hospital Cross-Specialty Audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Pill className="w-3.5 h-3.5 text-teal-700" />}
            onClick={() => navigate(`/patients/${patientId}/safety`)}
          >
            Medication Safety Engine
          </Button>
        </div>
      </div>

      {/* Core Architectural Invariant Banner */}
      <div className="p-3 bg-teal-50/70 border border-teal-200 rounded text-xs text-teal-950 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-teal-800 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold text-teal-900 flex items-center gap-2">
            <span>Preserving Conflicting Records Across Healthcare Facilities</span>
            <span className="text-2xs font-mono px-1.5 py-0.2 bg-teal-200/60 rounded text-teal-950">
              Deterministic Conflict Trace
            </span>
          </div>
          <p className="text-2xs text-teal-900/80 leading-relaxed">
            Clinical conflicts are strictly preserved in chronological sequence and never auto-resolved.
            The system detects inconsistent dates, medication status contradictions, differing doses, duplicates,
            and stale info. <strong className="font-semibold text-teal-950">The newest record is NOT assumed to be correct.</strong> Clinician resolution is strictly audited.
          </p>
        </div>
      </div>

      {successBanner && (
        <Banner variant="info" title="Conflict Resolution Recorded">
          {successBanner}
        </Banner>
      )}

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Chronological Events</div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
            {report.total_events}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">Encounters, orders, records</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Unresolved Conflicts</div>
          <div
            className={`text-lg font-bold font-mono mt-0.5 ${
              report.unresolved_conflicts_count > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {report.unresolved_conflicts_count}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">
            {report.conflicts_count} total detected clusters
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Participating Facilities</div>
          <div className="text-lg font-bold font-mono text-teal-800 mt-0.5">
            {report.hospitals_involved.length}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">
            {report.hospitals_involved.map((h) => h.name).join(', ')}
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Active Specialties</div>
          <div className="text-lg font-bold font-mono text-slate-800 mt-0.5">
            {report.departments_involved.length}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5 truncate">
            {report.departments_involved.slice(0, 3).join(', ')}
          </div>
        </div>
      </div>

      {/* Detected Conflict Clusters Section */}
      {report.conflicts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Detected Cross-Facility Conflict Clusters ({report.conflicts.length})
              </h2>
            </div>
            <span className="text-2xs font-mono text-slate-400">
              Multi-Source Verification Required
            </span>
          </div>

          <div className="space-y-3">
            {report.conflicts.map((conf) => {
              const isResolved = conf.status === 'resolved'

              return (
                <div
                  key={conf.conflict_id}
                  className={`p-3.5 bg-white border rounded shadow-sm transition-colors space-y-3 ${
                    isResolved ? 'border-slate-300' : 'border-rose-300 bg-rose-50/15'
                  }`}
                >
                  {/* Conflict Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                        Conflict: {conf.rule_id}
                      </span>
                      <h3 className="text-xs font-bold text-slate-900">{conf.title}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {isResolved ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Resolved Decision
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                          Unresolved Conflict
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Warning Notice */}
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-2xs text-amber-900 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">INVARIANT: </span>
                      {conf.warning}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{conf.explanation}</p>

                  {/* Chronological Source Sequence (Flagging all 3+ dates & sources) */}
                  <div className="space-y-1.5">
                    <div className="text-2xs font-bold uppercase text-slate-500 tracking-wider">
                      Flagged Dates & Sources ({conf.dates.length} Points in Time):
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {conf.events_involved.map((ev, i) => (
                        <div
                          key={ev.event_id || i}
                          className="p-2 bg-slate-50 border border-slate-200 rounded text-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-800 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {ev.date}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded font-mono font-semibold ${
                                ev.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-rose-100 text-rose-900'
                              }`}
                            >
                              {ev.status}
                            </span>
                          </div>
                          <div className="font-semibold text-slate-900 truncate">{ev.source}</div>
                          <div className="text-slate-500 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {ev.hospital_name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Resolution Trail if Resolved */}
                  {isResolved && conf.resolved_reason && (
                    <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded text-2xs space-y-0.5">
                      <div className="font-bold text-emerald-900 flex items-center justify-between">
                        <span>Audited Clinician Resolution ({conf.resolution}):</span>
                        <span className="font-mono text-emerald-800">{conf.resolved_by}</span>
                      </div>
                      <p className="text-emerald-800 italic">"{conf.resolved_reason}"</p>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="font-mono text-2xs text-slate-400">
                      ID: {conf.conflict_id}
                    </span>

                    {!isResolved && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />}
                        onClick={() => handleOpenResolve(conf)}
                      >
                        Resolve Conflict (Clinician Audit)
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Filter Toolbar */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Timeline Events ({report.timeline.length} Filtered)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-2xs">
            {/* Hospital Filter */}
            <select
              aria-label="Filter timeline by hospital"
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="all">All Hospitals</option>
              {report.hospitals_involved.map((h) => (
                <option key={h.hospital_id} value={h.hospital_id}>
                  {h.name}
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              aria-label="Filter timeline by department"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="all">All Specialties</option>
              {report.departments_involved.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>

            {/* Event Type Filter */}
            <select
              aria-label="Filter timeline by event type"
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="all">All Event Types</option>
              <option value="prescription">Prescriptions</option>
              <option value="clinical_encounter">Clinical Encounters</option>
              <option value="verified_clinical_record">Verified Records</option>
            </select>

            {/* Conflict Only Toggle */}
            <button
              type="button"
              onClick={() => setConflictOnly(!conflictOnly)}
              className={`px-2 py-1 rounded border text-2xs font-semibold flex items-center gap-1 transition-colors ${
                conflictOnly
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              Conflicts Only
            </button>
          </div>
        </div>

        {/* Chronological Timeline Cards */}
        {report.timeline.length === 0 ? (
          <EmptyState
            title="No matching events found"
            description="No timeline events match the selected hospital or filter criteria."
          />
        ) : (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-slate-200">
            {report.timeline.map((evt) => {
              const isPrescription = evt.event_type === 'prescription'
              const isRecord = evt.event_type === 'verified_clinical_record'

              return (
                <div
                  key={evt.event_id}
                  className={`relative pl-9 transition-colors`}
                >
                  {/* Timeline bullet dot */}
                  <div
                    className={`absolute left-2.5 top-3.5 w-3 h-3 rounded-full border-2 bg-white -translate-x-1/2 ${
                      evt.has_conflict
                        ? 'border-rose-600 ring-2 ring-rose-200'
                        : isRecord
                        ? 'border-emerald-600'
                        : isPrescription
                        ? 'border-teal-600'
                        : 'border-slate-400'
                    }`}
                  />

                  {/* Event Card */}
                  <div
                    className={`p-3.5 bg-white border rounded shadow-sm hover:border-slate-300 transition-colors space-y-2 ${
                      evt.has_conflict ? 'border-rose-300 bg-rose-50/10' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-2xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {evt.timestamp}
                        </span>

                        <h4 className="text-xs font-bold text-slate-900">{evt.title}</h4>

                        {/* Visible Conflict Marker with Text + Icon */}
                        {evt.has_conflict &&
                          evt.conflict_markers.map((marker, mIdx) => (
                            <span
                              key={mIdx}
                              className="inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-700" />
                              {marker.label}
                            </span>
                          ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-2xs font-semibold uppercase px-2 py-0.5 rounded border ${
                            evt.status === 'active' || evt.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : evt.status === 'discontinued'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {evt.status}
                        </span>
                      </div>
                    </div>

                    {/* Facility and Provider Line */}
                    <div className="flex flex-wrap items-center gap-3 text-2xs text-slate-500">
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {evt.hospital_name}
                      </span>
                      <span>•</span>
                      <span>Department: {evt.department}</span>
                      {evt.provider_name && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {evt.provider_name}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Event Specific Details */}
                    {evt.details && Object.keys(evt.details).length > 0 && (
                      <div className="text-2xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 space-y-1">
                        {Boolean(evt.details.chief_complaint) && (
                          <div>
                            <span className="font-semibold text-slate-700">Chief Complaint: </span>
                            <span>{String(evt.details.chief_complaint)}</span>
                          </div>
                        )}
                        {Boolean(evt.details.discontinuation_reason) && (
                          <div className="text-rose-900 font-medium">
                            <span className="font-semibold text-rose-950">Discontinuation Note: </span>
                            <span>{String(evt.details.discontinuation_reason)}</span>
                          </div>
                        )}
                        {Boolean(evt.details.notes) && (
                          <div>
                            <span className="font-semibold text-slate-700">Clinical Notes: </span>
                            <span>{String(evt.details.notes)}</span>
                          </div>
                        )}
                        {Array.isArray(evt.details.diagnosis_codes) && evt.details.diagnosis_codes.length > 0 && (
                          <div>
                            <span className="font-semibold text-slate-700">Diagnoses: </span>
                            <span>{evt.details.diagnosis_codes.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Clinician Conflict Resolution Modal */}
      <TimelineConflictResolutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmResolve}
        conflict={activeConflict}
      />
    </div>
  )
}
