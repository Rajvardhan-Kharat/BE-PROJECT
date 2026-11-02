import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import type { PatientOverview, PatientTimelineResponse } from '../types/patient'
import type { RecordVersionResponse } from '../types/verification'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { StatusChip } from '../components/ui/StatusChip'
import { EmptyState } from '../components/ui/EmptyState'
import {
  ArrowLeft,
  User,
  AlertCircle,
  ShieldCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Activity,
  FileCheck2,
  ArrowRight,
  Pill,
  History,
  HeartPulse,
  ShieldAlert,
  ScrollText,
} from 'lucide-react'
import { BreakGlassRequestModal } from '../components/break_glass/BreakGlassRequestModal'

export const PatientOverviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showBreakGlassModal, setShowBreakGlassModal] = React.useState(false)

  // 1. Query Patient Overview
  const {
    data: patient,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    error: overviewError,
  } = useQuery<PatientOverview>({
    queryKey: ['patient', id],
    queryFn: async () => {
      return await api.get<PatientOverview>(`/patients/${id}`)
    },
    enabled: !!id,
  })

  // 2. Query Patient Timeline
  const {
    data: timeline,
    isLoading: isTimelineLoading,
  } = useQuery<PatientTimelineResponse>({
    queryKey: ['patient_timeline', id],
    queryFn: async () => {
      return await api.get<PatientTimelineResponse>(`/patients/${id}/timeline`)
    },
    enabled: !!id,
  })

  // 3. Query Pending Records for this patient
  const {
    data: pendingRecords = [],
    isLoading: isPendingLoading,
  } = useQuery<RecordVersionResponse[]>({
    queryKey: ['patient_pending_records', id],
    queryFn: async () => {
      try {
        const res = await api.get<RecordVersionResponse[]>(`/patients/${id}/pending-records`)
        return Array.isArray(res) ? res : []
      } catch {
        return []
      }
    },
    enabled: !!id,
  })

  const safePendingRecords = Array.isArray(pendingRecords) ? pendingRecords : []

  if (isOverviewLoading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 max-w-xl mx-auto">
        <div className="inline-block animate-spin w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full mb-3" />
        <div className="font-medium">Loading authorized clinical profile...</div>
        <div className="text-2xs text-slate-400 mt-1">Verifying care-team permissions and consent state</div>
      </div>
    )
  }

  if (isOverviewError || !patient) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-6">
        <Banner variant="critical" title="Permission Denied or Record Not Found">
          {overviewError instanceof Error
            ? overviewError.message
            : 'Access to this patient record is restricted or the record does not exist.'}
        </Banner>
        <div className="bg-amber-50 border border-amber-200 rounded p-4 text-xs space-y-3">
          <div className="font-semibold text-amber-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700" />
            Emergency Clinical Override Available
          </div>
          <p className="text-amber-800">
            If you are responding to an acute life-threatening emergency or clinical handoff for this patient,
            you may activate an audited emergency break-glass override to view essential safety summaries.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="danger"
              icon={<ShieldAlert className="w-3.5 h-3.5" />}
              onClick={() => setShowBreakGlassModal(true)}
            >
              Request Emergency Break-Glass Access
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
              onClick={() => navigate('/patients')}
            >
              Return to directory
            </Button>
          </div>
        </div>

        {showBreakGlassModal && id && (
          <BreakGlassRequestModal
            patientId={id}
            onClose={() => setShowBreakGlassModal(false)}
            onSuccess={() => {
              setShowBreakGlassModal(false)
              navigate(`/patients/${id}/break-glass-view`)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top action navigation */}
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          onClick={() => navigate('/patients')}
        >
          Back to directory
        </Button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<ShieldCheck className="w-3.5 h-3.5 text-teal-700" />}
            onClick={() => navigate(`/patients/${patient.patient_id}/consent`)}
          >
            Consent
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<ScrollText className="w-3.5 h-3.5 text-slate-600" />}
            onClick={() => navigate(`/patients/${patient.patient_id}/access-log`)}
          >
            Access Log
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<History className="w-3.5 h-3.5 text-teal-700" />}
            onClick={() => navigate(`/patients/${patient.patient_id}/timeline`)}
          >
            Timeline Conflict Audit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<HeartPulse className="w-3.5 h-3.5 text-rose-600" />}
            onClick={() => navigate(`/patients/${patient.patient_id}/emergency-summary`)}
          >
            Emergency Profile
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Pill className="w-3.5 h-3.5 text-teal-700" />}
            onClick={() => navigate(`/patients/${patient.patient_id}/safety`)}
          >
            Medication Safety
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<ShieldAlert className="w-3.5 h-3.5 text-red-100" />}
            onClick={() => setShowBreakGlassModal(true)}
          >
            Break-Glass
          </Button>
          <span className="text-2xs font-mono text-slate-400">
            Internal ID: {patient.patient_id}
          </span>
        </div>
      </div>

      {/* Patient Header Clinical Card */}
      <div className="p-4 bg-white border border-slate-300 rounded shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  {patient.name}
                </h1>
                <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                  MRN: {patient.mrn}
                </span>
                {patient.active_consent ? (
                  <span className="inline-flex items-center gap-1 text-2xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <ShieldCheck className="w-3 h-3 text-emerald-700" />
                    Consent Active
                  </span>
                ) : (
                  <span className="text-2xs text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-medium">
                    Consent Revoked
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                <span>DOB: <span className="font-mono text-slate-800">{patient.date_of_birth}</span></span>
                <span className="text-slate-300">•</span>
                <span>Gender: <span className="text-slate-800">{patient.gender}</span></span>
                <span className="text-slate-300">•</span>
                <span>Blood Type: <span className="font-mono text-slate-800 font-semibold">{patient.blood_type}</span></span>
              </div>
            </div>
          </div>

          {/* Critical Alerts */}
          {patient.allergies.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium self-start md:self-auto">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <div>
                <span className="text-2xs uppercase tracking-wider block font-bold text-rose-900">
                  Documented Allergies
                </span>
                <span>{patient.allergies.join(', ')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Linked Hospital Facilities & Care Teams */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
              Linked Health Systems (Dual-Hospital Scope)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {patient.hospitals.map((hosp) => (
                <div
                  key={hosp.hospital_id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-800"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-medium">{hosp.name}</span>
                  <span className="text-2xs font-mono text-slate-500">({hosp.hospital_id})</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
              Authorized Care Teams
            </span>
            <div className="flex flex-wrap gap-1.5">
              {patient.care_teams.map((ct) => (
                <div
                  key={ct.care_team_id}
                  className="px-2 py-1 rounded bg-teal-50 border border-teal-200 text-teal-900 text-xs"
                >
                  <span className="font-semibold">{ct.care_team_name}</span>
                  <span className="text-2xs text-teal-700 ml-1">({ct.role})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Authorized Encounters Timeline */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-700" />
            <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Authorized Clinical Timeline ({patient.encounters_count} Encounters)
            </h2>
          </div>
          <span className="text-2xs font-mono text-slate-400">
            Chronological Audit
          </span>
        </div>

        {isTimelineLoading ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded">
            Loading encounters...
          </div>
        ) : !timeline || timeline.events.length === 0 ? (
          <EmptyState
            title="No clinical encounters recorded"
            description="No inpatient or outpatient encounters found for this patient."
          />
        ) : (
          <div className="space-y-2">
            {timeline.events.map((evt) => {
              const isVerifiedRecord = evt.event_type === 'verified_clinical_record'

              return (
                <div
                  key={evt.event_id}
                  className={`p-3 bg-white border rounded hover:border-slate-300 transition-colors space-y-1.5 ${
                    isVerifiedRecord ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isVerifiedRecord ? 'bg-emerald-600' : 'bg-teal-600'
                        }`}
                      />
                      <span className="font-semibold text-slate-900 text-base">
                        {evt.title}
                      </span>
                      {isVerifiedRecord ? (
                        <span className="text-2xs font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-medium">
                          Verified v{evt.details?.version_number || 1}
                        </span>
                      ) : (
                        <span className="text-2xs font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {evt.event_id}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-slate-500 shrink-0">
                      {evt.timestamp}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pl-4">
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      <span className="font-medium text-slate-700">{evt.hospital_name}</span>
                    </div>
                    {isVerifiedRecord ? (
                      evt.details?.reviewed_by && (
                        <span className="flex items-center gap-1 text-emerald-800">
                          <ShieldCheck className="w-3 h-3 text-emerald-700" />
                          <span>Signed by verifier: <span className="font-medium">{evt.details.reviewed_by}</span></span>
                        </span>
                      )
                    ) : (
                      <>
                        {evt.details?.attending_doctor_name && (
                          <span>Attending: <span className="text-slate-800">{evt.details.attending_doctor_name}</span></span>
                        )}
                        {evt.details?.discharge_date && (
                          <span>Discharged: <span className="font-mono text-slate-700">{evt.details.discharge_date}</span></span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Details box */}
                  {isVerifiedRecord ? (
                    evt.details?.data && (
                      <div className="text-xs text-slate-800 pl-4 bg-emerald-50/30 p-2 rounded border border-emerald-100 mt-1 space-y-1">
                        {evt.details.data.primary_diagnosis && (
                          <div>
                            <span className="font-semibold text-slate-700">Diagnosis: </span>
                            <span>{evt.details.data.primary_diagnosis}</span>
                          </div>
                        )}
                        {evt.details.data.proposed_medication && (
                          <div>
                            <span className="font-semibold text-slate-700">Medication Order: </span>
                            <span>{evt.details.data.proposed_medication}</span>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-slate-700 pl-4 bg-slate-50/70 p-2 rounded border border-slate-100 mt-1">
                      <div className="text-slate-900 font-medium">Chief Complaint: {evt.details?.chief_complaint}</div>
                      {evt.details?.diagnosis_codes && evt.details.diagnosis_codes.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {evt.details.diagnosis_codes.map((dx: string, i: number) => (
                            <span key={i} className="text-2xs font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800">
                              {dx}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Clinical Verification Sections (Verified vs Pending Review) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* 1. Verified Clinical Records */}
        <section className="space-y-3 p-4 bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                Verified Records (Trusted Collection)
              </h3>
            </div>
            <span className="text-2xs font-mono font-medium px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              {patient.verified_records_count || 0} Verified
            </span>
          </div>

          {(patient.verified_records_count || 0) > 0 ? (
            <div className="p-3 bg-emerald-50/20 border border-emerald-200 rounded text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-900 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>{patient.verified_records_count} active verified record(s) on file</span>
              </div>
              <p className="text-2xs text-slate-600">
                All approved clinical entities appear chronologically in the Authorized Clinical Timeline above. They cannot be overwritten by stale imports.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<FileCheck2 className="w-4 h-4 text-slate-400" />}
              title="No verified clinical records"
              description="Records appear here only after human clinician sign-off or immutable verifier approval. AI proposals never write directly to trusted collections."
            />
          )}
        </section>

        {/* 2. Pending Review Records (Separated from trusted timeline) */}
        <section className="space-y-3 p-4 bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700" />
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                Pending Review (AI Proposals)
              </h3>
            </div>
            <span className="text-2xs font-mono font-medium px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
              {safePendingRecords.length} Pending
            </span>
          </div>

          {isPendingLoading ? (
            <div className="p-6 text-center text-xs text-slate-400">Loading pending proposals...</div>
          ) : safePendingRecords.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-4 h-4 text-slate-400" />}
              title="No extractions pending review"
              description="Untrusted document uploads and external Aria service extraction proposals will populate here for verifier evaluation."
            />
          ) : (
            <div className="space-y-2">
              {safePendingRecords.map((rec) => (
                <div
                  key={rec.version_id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded hover:border-slate-300 transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">{rec.title}</span>
                      <span className="text-2xs font-mono text-teal-800 font-medium">
                        v{rec.version_number}
                      </span>
                    </div>
                    <div className="text-2xs text-slate-500">
                      Author: {rec.submitter_name || rec.submitted_by || 'System AI'} •{' '}
                      <span className="font-mono">{new Date(rec.submitted_at).toLocaleDateString()}</span>
                    </div>
                    {rec.review_reason && (
                      <div className="text-2xs text-rose-700 italic">Note: {rec.review_reason}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusChip status={rec.status} size="sm" />
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/verification/${rec.version_id}/compare`)}
                      className="h-6 px-2 text-2xs"
                      icon={<ArrowRight className="w-3 h-3" />}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showBreakGlassModal && patient && (
        <BreakGlassRequestModal
          patientId={patient.patient_id}
          onClose={() => setShowBreakGlassModal(false)}
          onSuccess={() => {
            setShowBreakGlassModal(false)
            navigate(`/patients/${patient.patient_id}/break-glass-view`)
          }}
        />
      )}
    </div>
  )
}
