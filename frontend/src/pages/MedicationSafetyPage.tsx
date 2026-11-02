import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { ClinicalAlert, Prescription, SafetyCheckResult } from '../types/safety'
import type { PatientOverview } from '../types/patient'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import { AlertActionModal } from '../components/safety/AlertActionModal'
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Play,
  Pill,
  Check,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'

export const MedicationSafetyPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const patientId = id || 'PAT-SYN-001'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'dismissed' | 'resolved'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'potential_clinical_concern' | 'data_inconsistency'>('all')
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({})

  // Modal State
  const [actionAlert, setActionAlert] = useState<ClinicalAlert | null>(null)
  const [actionType, setActionType] = useState<'dismiss' | 'resolve'>('dismiss')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // 1. Fetch Patient
  const { data: patient } = useQuery<PatientOverview>({
    queryKey: ['patient', patientId],
    queryFn: () => api.get<PatientOverview>(`/patients/${patientId}`),
    enabled: !!patientId,
  })

  // 2. Fetch Alerts
  const {
    data: alerts = [],
    isLoading: isAlertsLoading,
  } = useQuery<ClinicalAlert[]>({
    queryKey: ['patient_alerts', patientId, statusFilter, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (typeFilter !== 'all') params.type = typeFilter
      const queryStr = new URLSearchParams(params).toString()
      return api.get<ClinicalAlert[]>(`/patients/${patientId}/safety/alerts${queryStr ? `?${queryStr}` : ''}`)
    },
    enabled: !!patientId,
  })

  // 3. Fetch Prescriptions
  const {
    data: prescriptions = [],
    isLoading: isPrescriptionsLoading,
  } = useQuery<Prescription[]>({
    queryKey: ['patient_prescriptions', patientId],
    queryFn: () => api.get<Prescription[]>(`/patients/${patientId}/prescriptions`),
    enabled: !!patientId,
  })

  // Run Safety Checks Mutation
  const runChecksMutation = useMutation({
    mutationFn: () => api.post<SafetyCheckResult>(`/patients/${patientId}/safety/run-checks`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['patient_alerts', patientId] })
      setSuccessMessage(
        `Safety evaluation completed: ${result.rules_evaluated} rules evaluated, ${result.total_alerts} active alerts cataloged (${result.new_alerts} new).`
      )
      setTimeout(() => setSuccessMessage(null), 5000)
    },
  })

  const toggleExpand = (alertId: string) => {
    setExpandedAlerts((prev) => ({ ...prev, [alertId]: !prev[alertId] }))
  }

  const handleOpenAction = (alert: ClinicalAlert, type: 'dismiss' | 'resolve') => {
    setActionAlert(alert)
    setActionType(type)
    setIsModalOpen(true)
  }

  const handleConfirmAction = async (reason: string) => {
    if (!actionAlert) return
    const endpoint = `/safety/alerts/${actionAlert.alert_id}/${actionType}`
    await api.post(endpoint, { reason })
    await queryClient.invalidateQueries({ queryKey: ['patient_alerts', patientId] })
    setSuccessMessage(
      actionType === 'dismiss'
        ? `Alert ${actionAlert.rule_id} dismissed with recorded rationale.`
        : `Alert ${actionAlert.rule_id} marked resolved with corrective documentation.`
    )
    setTimeout(() => setSuccessMessage(null), 5000)
  }

  const openAlertsCount = alerts.filter((a) => a.status === 'open').length
  const clinicalConcernsCount = alerts.filter((a) => a.type === 'potential_clinical_concern').length
  const dataInconsistenciesCount = alerts.filter((a) => a.type === 'data_inconsistency').length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Actions */}
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
              <Pill className="w-4 h-4 text-teal-800" />
              Medication & Safety Conflict Engine
            </h1>
            <p className="text-2xs text-slate-500 font-mono">
              Patient: {patient?.name || patientId} ({patient?.mrn || patientId}) • Reference: synthetic_data/drug_reference_v1.json
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={runChecksMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            onClick={() => runChecksMutation.mutate()}
            disabled={runChecksMutation.isPending}
          >
            {runChecksMutation.isPending ? 'Evaluating Rules...' : 'Run Safety Checks'}
          </Button>
        </div>
      </div>

      {/* Rules Banner */}
      <div className="p-3 bg-teal-50/70 border border-teal-200 rounded text-xs text-teal-950 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-teal-800 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold text-teal-900 flex items-center gap-2">
            <span>Deterministic Clinical Rules Engine (v1.0.0)</span>
            <span className="text-2xs font-mono px-1.5 py-0.2 bg-teal-200/60 rounded text-teal-950">
              Synthetic Demonstration Catalog
            </span>
          </div>
          <p className="text-2xs text-teal-900/80 leading-relaxed">
            Evaluates duplicate active prescriptions, allergy-class contraindications, listed drug interactions (~15 pairs),
            cross-encounter status contradictions, and dosage/duration bounds. Strictly deterministic; no LLM pharmacology and no invented severity scores.
          </p>
        </div>
      </div>

      {successMessage && (
        <Banner variant="info" title="Safety System Notification">
          {successMessage}
        </Banner>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Active Prescriptions</div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
            {prescriptions.filter((p) => p.status === 'active').length}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">{prescriptions.length} total records</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Open Clinical Alerts</div>
          <div className={`text-lg font-bold font-mono mt-0.5 ${openAlertsCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {openAlertsCount}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">Requires clinical disposition</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Clinical Concerns</div>
          <div className="text-lg font-bold font-mono text-rose-800 mt-0.5">
            {clinicalConcernsCount}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">Allergies, DDI, dose limit</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
          <div className="text-2xs font-semibold uppercase text-slate-500">Data Inconsistencies</div>
          <div className="text-lg font-bold font-mono text-amber-800 mt-0.5">
            {dataInconsistenciesCount}
          </div>
          <div className="text-2xs text-slate-400 mt-0.5">Duplicates, status contradictions</div>
        </div>
      </div>

      {/* Main Dual Grid: Prescriptions vs Conflict Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Active Prescriptions (5 cols) */}
        <section className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-slate-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Prescriptions ({prescriptions.length})
              </h2>
            </div>
            <span className="text-2xs text-slate-400 font-mono">Current & Historical</span>
          </div>

          {isPrescriptionsLoading ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded">
              Loading medications...
            </div>
          ) : prescriptions.length === 0 ? (
            <EmptyState
              title="No prescriptions cataloged"
              description="No active or historical medication orders found for this patient."
            />
          ) : (
            <div className="space-y-2">
              {prescriptions.map((rx) => (
                <div
                  key={rx.prescription_id}
                  className="p-3 bg-white border border-slate-200 rounded hover:border-slate-300 transition-colors space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                        <span>{rx.drug_name}</span>
                        <span className="font-mono text-2xs text-slate-500 font-normal">
                          {rx.dosage} • {rx.frequency} • {rx.route}
                        </span>
                      </div>
                      {rx.duration_days && (
                        <div className="text-2xs text-slate-500">
                          Course duration: <span className="font-mono font-medium">{rx.duration_days} days</span>
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 rounded border ${
                        rx.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : rx.status === 'discontinued'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {rx.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-2xs text-slate-400 font-mono pt-1 border-t border-slate-100">
                    <span>ID: {rx.prescription_id}</span>
                    <span>{rx.hospital_id || 'System'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Safety & Conflict Findings (7 cols) */}
        <section className="lg:col-span-7 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Safety Alerts & Inconsistencies ({alerts.length})
              </h2>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2 text-2xs">
              <select
                aria-label="Filter alerts by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 font-sans focus:outline-none focus:border-teal-700"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open Only</option>
                <option value="dismissed">Dismissed</option>
                <option value="resolved">Resolved</option>
              </select>

              <select
                aria-label="Filter alerts by type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 font-sans focus:outline-none focus:border-teal-700"
              >
                <option value="all">All Types</option>
                <option value="potential_clinical_concern">Clinical Concerns</option>
                <option value="data_inconsistency">Data Inconsistencies</option>
              </select>
            </div>
          </div>

          {isAlertsLoading ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded">
              Evaluating alerts...
            </div>
          ) : alerts.length === 0 ? (
            <EmptyState
              title="No clinical conflicts detected"
              description="Deterministic rules engine found no allergy contraindications, listed interactions, duplicate orders, or status inconsistencies."
            />
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const isConcern = alert.type === 'potential_clinical_concern'
                const isExpanded = !!expandedAlerts[alert.alert_id]

                return (
                  <div
                    key={alert.alert_id}
                    className={`p-3.5 bg-white border rounded shadow-sm transition-colors space-y-2.5 ${
                      alert.status === 'open'
                        ? isConcern
                          ? 'border-rose-300 bg-rose-50/15'
                          : 'border-amber-300 bg-amber-50/15'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Header: Type, Rule ID, and Status */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isConcern ? (
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-700" />
                            Potential Clinical Concern
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-700" />
                            Data Inconsistency
                          </span>
                        )}

                        <span className="font-mono text-2xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                          {alert.rule_id}
                        </span>
                        <span className="text-2xs text-slate-400 font-mono">v{alert.rule_version}</span>
                      </div>

                      {/* Status Chip */}
                      <div>
                        {alert.status === 'open' && (
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                            Open
                          </span>
                        )}
                        {alert.status === 'dismissed' && (
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            <Check className="w-3 h-3 text-slate-500" />
                            Dismissed (Acknowledged)
                          </span>
                        )}
                        {alert.status === 'resolved' && (
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            Resolved
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title and Clinical Explanation */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">{alert.title}</h3>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">{alert.explanation}</p>
                      <div className="text-2xs text-slate-500 font-mono mt-1">
                        Source: {alert.source}
                      </div>
                    </div>

                    {/* Evidence References Accordion */}
                    {alert.evidence_refs && alert.evidence_refs.length > 0 && (
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleExpand(alert.alert_id)}
                          className="w-full flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100 text-left text-2xs font-semibold text-slate-700 transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            Clinical Evidence References ({alert.evidence_refs.length})
                          </span>
                          <span className="font-mono text-slate-400">Deterministic trace</span>
                        </button>

                        {isExpanded && (
                          <div className="p-2.5 bg-white divide-y divide-slate-100 space-y-1.5">
                            {alert.evidence_refs.map((ref, idx) => (
                              <div key={idx} className="pt-1.5 first:pt-0 text-2xs space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-teal-800 font-semibold uppercase">
                                    [{ref.ref_type}] {ref.ref_id}
                                  </span>
                                </div>
                                <p className="text-slate-600 font-sans">{ref.description}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Disposition Trail if Dismissed or Resolved */}
                    {alert.status === 'dismissed' && alert.dismissed_reason && (
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-2xs space-y-0.5">
                        <div className="font-semibold text-slate-700 flex items-center justify-between">
                          <span>Dismissal Justification (Documented Exception):</span>
                          <span className="font-mono text-slate-400">{alert.dismissed_by}</span>
                        </div>
                        <p className="text-slate-600 italic">"{alert.dismissed_reason}"</p>
                      </div>
                    )}

                    {alert.status === 'resolved' && alert.resolved_reason && (
                      <div className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded text-2xs space-y-0.5">
                        <div className="font-semibold text-emerald-900 flex items-center justify-between">
                          <span>Remediation Record:</span>
                          <span className="font-mono text-emerald-800">{alert.resolved_by}</span>
                        </div>
                        <p className="text-emerald-800 italic">"{alert.resolved_reason}"</p>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-2xs font-mono text-slate-400">
                        Alert ID: {alert.alert_id}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {alert.status === 'open' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenAction(alert, 'dismiss')}
                            >
                              Dismiss (Rationale)
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Check className="w-3.5 h-3.5" />}
                              onClick={() => handleOpenAction(alert, 'resolve')}
                            >
                              Resolve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Action Dialog Modal */}
      <AlertActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmAction}
        alert={actionAlert}
        actionType={actionType}
      />
    </div>
  )
}
