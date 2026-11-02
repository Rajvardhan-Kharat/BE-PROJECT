import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldAlert,
  Clock,
  Pill,
  AlertTriangle,
  Printer,
  ShieldCheck,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import type { BreakGlassEmergencyViewResponse } from '../types/break_glass'

export const BreakGlassEmergencyViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const patientId = id || 'PAT-SYN-001'

  const {
    data: emergencyView,
    isLoading,
    isError,
    error,
  } = useQuery<BreakGlassEmergencyViewResponse>({
    queryKey: ['break_glass_view', patientId],
    queryFn: async () => {
      return await api.get<BreakGlassEmergencyViewResponse>(
        `/patients/${patientId}/break-glass-view`
      )
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto py-6 animate-pulse">
        <div className="h-10 bg-slate-200 rounded w-1/3"></div>
        <div className="h-28 bg-slate-100 rounded border border-slate-200"></div>
        <div className="h-64 bg-slate-100 rounded"></div>
      </div>
    )
  }

  if (isError || !emergencyView) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto py-8">
        <Banner variant="critical">
          Break-glass emergency view unavailable: {error instanceof Error ? error.message : 'Session invalid or expired'}.
        </Banner>
        <div className="p-4 bg-white border border-slate-200 rounded text-xs space-y-2">
          <h3 className="font-semibold text-slate-800">Need Emergency Access?</h3>
          <p className="text-slate-600">
            If an emergency override session has expired or was not yet initiated, you must submit a new clinical justification.
          </p>
          <Link to={`/patients/${patientId}`}>
            <Button size="sm" variant="secondary">
              Return to Patient Profile
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const { summary, allergies, active_medications } = emergencyView

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* Top Critical Alert Bar */}
      <div className="bg-rose-950 text-white px-4 py-2.5 rounded flex flex-wrap items-center justify-between gap-3 text-xs border border-rose-800">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />
          <div>
            <span className="font-bold tracking-wide uppercase text-rose-300 block text-xs">
              Break-Glass Emergency Clinical Session
            </span>
            <span className="text-2xs text-rose-200 font-mono">
              Session ID: {emergencyView.session_id} • Auto-expires in{' '}
              <strong className="text-white font-bold">{emergencyView.remaining_minutes} minutes</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.print()}
            icon={<Printer className="w-3.5 h-3.5 text-slate-300" />}
            className="text-white hover:text-white hover:bg-rose-900"
          >
            Print Emergency Sheet
          </Button>
          <Link to={`/patients/${patientId}/access-log`}>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:text-white hover:bg-rose-900"
            >
              Access Log
            </Button>
          </Link>
        </div>
      </div>

      {/* Mandatory Clinical Governance Disclaimer */}
      <div className="p-3 bg-rose-50 border border-rose-300 rounded text-rose-950 text-xs">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-bold">LIMITED EMERGENCY VIEW SCOPE: </span>
            {emergencyView.disclaimer}
          </div>
        </div>
      </div>

      {/* Patient Demographic Overview */}
      <div className="bg-white border border-slate-200 rounded p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{emergencyView.patient_name}</h1>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
              MRN: {emergencyView.mrn}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span>DOB: <strong className="font-mono text-slate-800">{emergencyView.date_of_birth}</strong></span>
            <span>•</span>
            <span>Blood Group: <strong className="font-mono font-bold text-rose-700">{emergencyView.blood_type}</strong></span>
          </div>
        </div>
      </div>

      {/* Two-Column Emergency Profile: Active Meds & Allergies beside Agent 4 Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Acute Safety Baseline (Allergies + Active Meds) (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Confirmed Drug Allergies */}
          <div className="bg-white border border-rose-300 rounded overflow-hidden">
            <div className="bg-rose-50 px-3.5 py-2 border-b border-rose-200 flex items-center justify-between">
              <span className="font-semibold text-rose-950 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                Documented Drug Allergies
              </span>
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200">
                {allergies.length} recorded
              </span>
            </div>

            <div className="p-3">
              {allergies.length === 0 ? (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-800 block">Allergy information unavailable</span>
                  Absence of recorded allergies must NOT be assumed as "No Known Allergies" (NKDA).
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allergies.map((allergy: any, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-rose-100 text-rose-900 border border-rose-300 font-mono text-xs font-semibold"
                    >
                      {typeof allergy === 'string' ? allergy : allergy.allergen || JSON.stringify(allergy)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Active Medications */}
          <div className="bg-white border border-teal-300 rounded overflow-hidden">
            <div className="bg-teal-50 px-3.5 py-2 border-b border-teal-200 flex items-center justify-between">
              <span className="font-semibold text-teal-950 text-xs flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-teal-700" />
                Active Prescriptions ({active_medications.length})
              </span>
              <span className="text-2xs font-mono text-teal-800">
                Approved Baseline
              </span>
            </div>

            <div className="divide-y divide-teal-100 max-h-80 overflow-y-auto">
              {active_medications.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  No active prescriptions currently documented.
                </div>
              ) : (
                active_medications.map((rx: any, idx: number) => (
                  <div key={idx} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{rx.medication_name}</span>
                      <span className="font-mono text-2xs text-slate-500">{rx.dosage}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono">
                      {rx.route} • {rx.frequency}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Agent 4 Emergency Clinical Summary (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Verified Items */}
          <div className="bg-white border border-emerald-300 rounded overflow-hidden">
            <div className="bg-emerald-50 px-3.5 py-2 border-b border-emerald-200 flex items-center justify-between">
              <span className="font-semibold text-emerald-950 text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                Verified Clinical History ({summary.verified.length})
              </span>
              <span className="text-2xs font-mono text-emerald-800">
                Clinician Verified
              </span>
            </div>

            <div className="divide-y divide-emerald-100 max-h-72 overflow-y-auto">
              {summary.verified.map((v, idx) => (
                <div key={idx} className="p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{v.label}</span>
                    <span className="text-2xs font-mono text-slate-500">{v.hospital_name}</span>
                  </div>
                  <div className="text-[11px] text-slate-700 font-mono bg-slate-50 p-1.5 rounded">
                    {v.details}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-Facility Conflicting Items */}
          {summary.conflicting.length > 0 && (
            <div className="bg-white border border-rose-300 rounded overflow-hidden">
              <div className="bg-rose-50 px-3.5 py-2 border-b border-rose-200 flex items-center justify-between">
                <span className="font-semibold text-rose-950 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                  Active Cross-Facility Conflicts ({summary.conflicting.length})
                </span>
              </div>
              <div className="divide-y divide-rose-100">
                {summary.conflicting.map((c, idx) => (
                  <div key={idx} className="p-3 text-xs space-y-1">
                    <span className="font-bold text-rose-950">{c.entity}</span>
                    <p className="text-[11px] text-rose-900 leading-relaxed">{c.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quarantined Pending Items Warning */}
          {summary.pending.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs space-y-1.5">
              <span className="font-semibold text-amber-950 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-800" />
                Unverified Proposals Quarantined ({summary.pending.length})
              </span>
              <p className="text-[11px] text-amber-900">
                {summary.pending.length} pending proposals are quarantined in backend and excluded from acute clinical decisions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
