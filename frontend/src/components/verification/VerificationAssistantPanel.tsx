import React from 'react'
import {
  Sparkles,
  AlertCircle,
  HelpCircle,
  FileText,
  GitCommit,
  AlertTriangle,
} from 'lucide-react'
import { StatusChip } from '../ui/StatusChip'
import type { VerificationAssistantResponse } from '../../types/verification_assistant'

interface VerificationAssistantPanelProps {
  data: VerificationAssistantResponse | undefined
  isLoading: boolean
  isError: boolean
  error?: unknown
}

export const VerificationAssistantPanel: React.FC<VerificationAssistantPanelProps> = ({
  data,
  isLoading,
  isError,
}) => {
  if (isLoading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded p-4 text-xs text-slate-500 animate-pulse">
        <div className="flex items-center gap-2 mb-2 font-medium text-slate-700">
          <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-spin" />
          Analyzing submission with Verification Assistant...
        </div>
        <p>Cross-referencing prior records, verifying source spans, and checking for missing clinical fields.</p>
      </div>
    )
  }

  if (isError || !data || !data.version_id) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Assistant Analysis Unavailable</div>
          <div className="text-amber-800 text-[11px] mt-0.5">
            Deterministic rule check and summary could not be retrieved. Human verification may proceed manually.
          </div>
        </div>
      </div>
    )
  }

  const suggestionLabel = data.suggestion ? data.suggestion.toUpperCase() : 'ADVISORY'
  const missingFields = data.missing_fields || []
  const uncertainFields = data.uncertain_fields || []
  const priorConflicts = data.conflicts_with_prior || []
  const diffs = data.old_vs_proposed_values || []
  const evidenceList = data.evidence || []

  return (
    <div className="bg-white border border-slate-200 rounded shadow-none text-xs space-y-4 p-4">
      {/* Header and Suggestion */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-teal-50 border border-teal-200 text-teal-800">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Verification Assistant</h3>
            <p className="text-[11px] text-slate-500">
              Deterministic rule checks + verified quote spans • Request ID{' '}
              <span className="font-mono text-slate-700">{data.agent_run_id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[11px] text-slate-500 font-medium">Assistant suggestion:</div>
          <StatusChip
            status={
              data.suggestion === 'approve'
                ? 'approved'
                : data.suggestion === 'reject'
                ? 'rejected'
                : 'requires_correction'
            }
            label={suggestionLabel}
          />
        </div>
      </div>

      {/* Advisory Disclaimer Strip */}
      <div className="bg-slate-50 border border-slate-200 px-3 py-2 rounded text-[11px] text-slate-600 flex items-center justify-between">
        <span>{data.disclaimer || 'Suggestion only. Backend enforces, human verifier decides.'}</span>
        <span className="text-slate-400 font-mono text-[10px]">advisory only</span>
      </div>

      {/* Reviewer Summary & Suggestion Rationale */}
      {(data.reviewer_summary || data.suggestion_rationale) && (
        <div className="bg-teal-50/40 border border-teal-100 rounded p-3 space-y-1.5">
          <div className="font-semibold text-teal-950 text-xs">Summary for Reviewer</div>
          <p className="text-teal-900 leading-relaxed text-xs">{data.reviewer_summary}</p>
          {data.suggestion_rationale && (
            <div className="text-[11px] text-teal-800 pt-1 border-t border-teal-100/60">
              <strong className="font-medium text-teal-950">Rationale: </strong>
              {data.suggestion_rationale}
            </div>
          )}
        </div>
      )}

      {/* Missing or Uncertain Fields */}
      {(missingFields.length > 0 || uncertainFields.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {missingFields.length > 0 && (
            <div className="border border-amber-200 bg-amber-50/50 rounded p-2.5">
              <div className="flex items-center gap-1.5 font-medium text-amber-900 mb-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                Missing Required Fields ({missingFields.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.map((field) => (
                  <span
                    key={field}
                    className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded font-mono text-[11px]"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {uncertainFields.length > 0 && (
            <div className="border border-sky-200 bg-sky-50/50 rounded p-2.5">
              <div className="flex items-center gap-1.5 font-medium text-sky-900 mb-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-sky-700" />
                Uncertain / Inferred Fields ({uncertainFields.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {uncertainFields.map((field) => (
                  <span
                    key={field}
                    className="px-1.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 rounded font-mono text-[11px]"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conflicts with Prior Records */}
      {priorConflicts.length > 0 && (
        <div className="border border-rose-200 rounded overflow-hidden">
          <div className="bg-rose-50 px-3 py-2 border-b border-rose-200 flex items-center gap-2 font-medium text-rose-900">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
            Prior Record Conflicts ({priorConflicts.length})
          </div>
          <div className="divide-y divide-rose-100 bg-rose-50/20">
            {priorConflicts.map((conflict) => (
              <div key={conflict.conflict_id} className="p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-rose-950">{conflict.field_name}</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Prior Rec: {conflict.prior_record_id}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] py-1">
                  <div className="bg-white border border-slate-200 p-1.5 rounded">
                    <span className="text-slate-400 block text-[10px]">Prior Value:</span>
                    <span className="font-mono text-slate-800">{String(conflict.prior_value ?? 'None')}</span>
                  </div>
                  <div className="bg-white border border-rose-200 p-1.5 rounded">
                    <span className="text-rose-500 block text-[10px]">Proposed Value:</span>
                    <span className="font-mono text-rose-900 font-medium">
                      {String(conflict.proposed_value ?? 'None')}
                    </span>
                  </div>
                </div>
                <p className="text-rose-900 text-[11px]">{conflict.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Old vs Proposed Values Table */}
      {diffs.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium text-slate-800">
            <GitCommit className="w-3.5 h-3.5 text-slate-500" />
            Field-by-Field Comparison ({diffs.length})
          </div>
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                <tr>
                  <th className="py-1.5 px-3">Field</th>
                  <th className="py-1.5 px-3">Prior Approved</th>
                  <th className="py-1.5 px-3">Proposed Value</th>
                  <th className="py-1.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {diffs.map((diff) => (
                  <tr key={diff.field_name} className={diff.is_changed ? 'bg-amber-50/40' : ''}>
                    <td className="py-1.5 px-3 font-semibold text-slate-900">{diff.field_name}</td>
                    <td className="py-1.5 px-3 text-slate-500">
                      {diff.old_value !== null && diff.old_value !== undefined
                        ? String(diff.old_value)
                        : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-slate-900">
                      {diff.proposed_value !== null && diff.proposed_value !== undefined
                        ? String(diff.proposed_value)
                        : '—'}
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      {diff.is_new ? (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px]">
                          New
                        </span>
                      ) : diff.is_changed ? (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px]">
                          Changed
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded text-[10px]">
                          Unchanged
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Verified Evidence Spans */}
      {evidenceList.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5 font-medium text-slate-800">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Verified Source Spans & Evidence ({evidenceList.length})
          </div>
          <div className="space-y-2">
            {evidenceList.map((ev, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-800">{ev.field_name}</span>
                  <span className="text-slate-500 font-mono text-[10px]">
                    Doc: {ev.doc_id || 'N/A'} {ev.page !== null ? `• Page ${ev.page}` : ''}
                  </span>
                </div>
                {ev.quote && (
                  <div className="bg-white border-l-2 border-teal-600 px-2.5 py-1 text-[11px] text-slate-700 font-mono">
                    "{ev.quote}"
                  </div>
                )}
                {ev.confidence_note && (
                  <div className="text-[10px] text-slate-500 italic">
                    Confidence: {ev.confidence_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
