import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  FileText,
  ShieldAlert,
  Building2,
  Layers,
  Sparkles,
} from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { StatusChip } from '../components/ui/StatusChip'
import { ExtractionStatusChip } from '../components/ui/ExtractionStatusChip'
import { VerificationDecisionModal } from '../components/verification/VerificationDecisionModal'
import { RecordHistoryModal } from '../components/verification/RecordHistoryModal'
import type {
  DecisionType,
  RecordComparisonResponse,
  FieldDiff,
} from '../types/verification'

export const RecordComparisonPage: React.FC = () => {
  const { versionId } = useParams<{ versionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [activeDecision, setActiveDecision] = useState<DecisionType | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false)
  const [feedbackNotification, setFeedbackNotification] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Query comparison data from backend
  const {
    data: comparison,
    isLoading,
    isError,
    error,
  } = useQuery<RecordComparisonResponse>({
    queryKey: ['record_comparison', versionId],
    queryFn: async () => {
      if (!versionId) throw new Error('No version ID')
      return await api.get<RecordComparisonResponse>(`/verification/${versionId}`)
    },
    enabled: !!versionId,
  })

  // Decision mutation (approve, reject, requires_correction)
  const decisionMutation = useMutation({
    mutationFn: async ({
      decision,
      reason,
      modifications,
    }: {
      decision: DecisionType
      reason?: string
      modifications?: Record<string, any>
    }) => {
      return await api.post(`/verification/${versionId}/decide`, {
        decision,
        reason,
        human_modifications: modifications,
      })
    },
    onSuccess: (data: any) => {
      setActiveDecision(null)
      queryClient.invalidateQueries({ queryKey: ['verification_queue'] })
      queryClient.invalidateQueries({ queryKey: ['record_comparison', versionId] })
      queryClient.invalidateQueries({ queryKey: ['patient_timeline'] })
      queryClient.invalidateQueries({ queryKey: ['patient_overview'] })

      const actionText =
        data.status === 'approved'
          ? 'approved and committed to trusted clinical collection'
          : data.status === 'rejected'
          ? 'rejected and archived with clinical rationale'
          : 'marked as requires correction'

      setFeedbackNotification({
        type: 'success',
        message: `Clinical proposal successfully ${actionText}.`,
      })
    },
    onError: (err: any) => {
      setFeedbackNotification({
        type: 'error',
        message: err.message || 'Verification decision failed.',
      })
    },
  })

  if (isLoading) {
    return (
      <div className="p-16 text-center text-xs text-slate-500 max-w-xl mx-auto">
        <div className="w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="font-semibold text-slate-800">Loading Comparative Review Screen...</div>
        <div className="text-2xs text-slate-400 mt-1">
          Evaluating verifier credentials, patient scope, and active versions
        </div>
      </div>
    )
  }

  if (isError || !comparison) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white border border-rose-200 rounded text-center space-y-3">
        <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto" />
        <div className="font-semibold text-slate-900 text-sm">Unable to Load Comparison</div>
        <p className="text-xs text-slate-500">
          {(error as any)?.message || 'Record not found or access denied by clinical scope.'}
        </p>
        <Button size="sm" variant="secondary" onClick={() => navigate('/verification')}>
          Return to Queue
        </Button>
      </div>
    )
  }

  const { proposed_version, current_approved_version, field_diffs } = comparison
  const isSelf = proposed_version.submitted_by === user?.id

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Top Header & Context Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div className="flex items-start gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/verification')}
            className="h-8 px-2 text-slate-600 mt-0.5"
            title="Back to queue"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight">
                {proposed_version.title}
              </h1>
              <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                v{proposed_version.version_number} (Proposed)
              </span>
              <StatusChip status={proposed_version.status} size="sm" />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-2xs text-slate-500 mt-1">
              <span className="font-semibold text-slate-800">
                Patient: {comparison.patient_name} (MRN: {comparison.mrn})
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" />
                {comparison.hospital_name}
              </span>
              <span>•</span>
              <span className="font-medium text-slate-700">{proposed_version.department}</span>
              <span>•</span>
              <span>Submitted by {proposed_version.submitter_name || proposed_version.submitted_by}</span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistoryModal(true)}
            icon={<History className="w-3.5 h-3.5" />}
          >
            Revision History
          </Button>

          <Button
            size="sm"
            variant="danger"
            disabled={!comparison.can_current_user_approve}
            onClick={() => setActiveDecision('rejected')}
            icon={<XCircle className="w-3.5 h-3.5" />}
          >
            Reject
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={!comparison.can_current_user_approve}
            onClick={() => setActiveDecision('requires_correction')}
            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          >
            Request Correction
          </Button>

          <Button
            size="sm"
            variant="primary"
            disabled={!comparison.can_current_user_approve}
            onClick={() => setActiveDecision('approved')}
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          >
            Approve Record
          </Button>
        </div>
      </div>

      {/* Governance Restriction Alert */}
      {!comparison.can_current_user_approve && (
        <Banner variant="warning">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-2xs text-amber-950">
              <span className="font-semibold">Review Actions Restricted:</span>{' '}
              {comparison.restriction_reason ||
                'You are not permitted to review or approve this record under clinical governance rules.'}
              {isSelf && (
                <span className="block mt-0.5 font-medium text-amber-900">
                  Dual-authorization policy prohibits self-approval of clinical proposals. Another authorized senior verifier must sign off.
                </span>
              )}
            </div>
          </div>
        </Banner>
      )}

      {/* Notification banner */}
      {feedbackNotification && (
        <Banner
          variant={feedbackNotification.type === 'success' ? 'info' : 'warning'}
          onDismiss={() => setFeedbackNotification(null)}
        >
          {feedbackNotification.message}
        </Banner>
      )}

      {/* Two-Column Comparison View: Source beside Extraction & Current vs Proposed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Source Document / Text Snippet (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-300 rounded overflow-hidden shadow-xs">
          <div className="h-9 px-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Clinical Source Evidence</span>
            </div>
            <span className="text-2xs font-mono px-1 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
              Untrusted OCR / Note
            </span>
          </div>

          <div className="p-3.5 space-y-3">
            <div className="text-2xs text-slate-500">
              {proposed_version.source_document_id ? (
                <span>
                  Source Reference Document:{' '}
                  <span className="font-mono text-slate-800 font-semibold">
                    {proposed_version.source_document_id}
                  </span>
                </span>
              ) : (
                <span>Clinician submitted EHR note proposal</span>
              )}
            </div>

            {/* Source Snippet Display */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[460px] overflow-y-auto">
              {proposed_version.source_text_snippet ||
                'No raw text snippet attached to this clinical submission.'}
            </div>

            {/* Extracted Fields Provenance */}
            {proposed_version.extracted_fields &&
              proposed_version.extracted_fields.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-1 text-2xs font-semibold text-slate-700 uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 text-teal-700" />
                    <span>Grounding Provenance ({proposed_version.extracted_fields.length} Fields)</span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {proposed_version.extracted_fields.map((field: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-1.5 bg-slate-50 border border-slate-200 rounded text-2xs flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800 capitalize">
                          {field.field_name.replace(/_/g, ' ')}
                        </span>
                        <ExtractionStatusChip status={field.status || 'explicit'} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Right Column: Comparative Diff (Current vs Proposed) (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-300 rounded overflow-hidden shadow-xs">
          <div className="h-9 px-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              <span>Comparative Diff: Current Approved vs Proposed</span>
            </div>
            {current_approved_version ? (
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Updating Active v{current_approved_version.version_number}
              </span>
            ) : (
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                Initial Version Proposal
              </span>
            )}
          </div>

          <div className="p-3.5 space-y-4">
            {/* Version Transition Overview */}
            <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded text-xs">
              <div>
                <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                  Current Trusted Record
                </span>
                {current_approved_version ? (
                  <div className="space-y-0.5">
                    <span className="font-mono text-slate-900 font-semibold">
                      v{current_approved_version.version_number} (Approved)
                    </span>
                    <span className="text-2xs text-slate-500 block">
                      Reviewed by {current_approved_version.reviewer_name || 'Senior Doctor'}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-2xs">None (New clinical entity)</span>
                )}
              </div>

              <div>
                <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                  Proposed Replacement
                </span>
                <div className="space-y-0.5">
                  <span className="font-mono text-teal-800 font-semibold">
                    v{proposed_version.version_number} ({proposed_version.status})
                  </span>
                  <span className="text-2xs text-slate-500 block">
                    Authored by {proposed_version.submitter_name || 'Clinician'}
                  </span>
                </div>
              </div>
            </div>

            {/* Field Diff Table */}
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 border-b border-slate-200 text-2xs font-semibold text-slate-700">
                  <tr>
                    <th className="p-2 w-1/4">Clinical Field</th>
                    <th className="p-2 w-3/8">Current Approved Value</th>
                    <th className="p-2 w-3/8">Proposed Verified Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {field_diffs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-slate-400 text-2xs">
                        No field modifications detected.
                      </td>
                    </tr>
                  ) : (
                    field_diffs.map((diff: FieldDiff, idx: number) => {
                      const isAdded = diff.change_type === 'added'
                      const isModified = diff.change_type === 'modified'
                      const isRemoved = diff.change_type === 'removed'

                      return (
                        <tr
                          key={idx}
                          data-testid={`diff-row-${diff.field}`}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isModified
                              ? 'bg-amber-50/20'
                              : isAdded
                              ? 'bg-emerald-50/20'
                              : isRemoved
                              ? 'bg-rose-50/20'
                              : ''
                          }`}
                        >
                          {/* Field Name */}
                          <td className="p-2.5 font-medium text-slate-800 align-top">
                            <div className="capitalize">{diff.field.replace(/_/g, ' ')}</div>
                            <span
                              className={`inline-block text-2xs font-mono uppercase px-1 rounded border mt-0.5 ${
                                isModified
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : isAdded
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : isRemoved
                                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {diff.change_type}
                            </span>
                          </td>

                          {/* Current Value */}
                          <td className="p-2.5 text-slate-600 font-mono text-2xs align-top">
                            {diff.current_val !== null && diff.current_val !== undefined ? (
                              Array.isArray(diff.current_val) ? (
                                <ul className="list-disc pl-3.5 space-y-0.5">
                                  {diff.current_val.map((item: any, i: number) => (
                                    <li key={i}>{String(item)}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span>{String(diff.current_val)}</span>
                              )
                            ) : (
                              <span className="text-slate-400 italic">Not set</span>
                            )}
                          </td>

                          {/* Proposed Value */}
                          <td className="p-2.5 text-slate-900 font-mono text-2xs align-top">
                            {diff.proposed_val !== null && diff.proposed_val !== undefined ? (
                              Array.isArray(diff.proposed_val) ? (
                                <ul className="list-disc pl-3.5 space-y-0.5">
                                  {diff.proposed_val.map((item: any, i: number) => (
                                    <li key={i} className={isModified ? 'font-bold text-amber-950' : ''}>
                                      {String(item)}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className={isModified ? 'font-bold text-amber-950' : ''}>
                                  {String(diff.proposed_val)}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 italic">Omitted</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Decision Modal */}
      <VerificationDecisionModal
        isOpen={!!activeDecision}
        onClose={() => setActiveDecision(null)}
        decision={activeDecision}
        recordTitle={proposed_version.title}
        versionNumber={proposed_version.version_number}
        onConfirm={(reason, mods) =>
          decisionMutation.mutate({
            decision: activeDecision!,
            reason,
            modifications: mods,
          })
        }
        isSubmitting={decisionMutation.isPending}
        verifierName={user?.name}
        verifierRole={user?.role}
      />

      {/* Revision History Modal */}
      <RecordHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        recordId={proposed_version.record_id}
      />
    </div>
  )
}
