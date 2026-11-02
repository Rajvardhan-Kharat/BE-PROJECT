import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  User,
  ShieldCheck,
  Calendar,
  Clock,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { StatusChip } from '../ui/StatusChip'
import { api } from '../../services/api'
import type { RecordHistoryResponse } from '../../types/verification'

interface RecordHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  recordId: string | null
}

export const RecordHistoryModal: React.FC<RecordHistoryModalProps> = ({
  isOpen,
  onClose,
  recordId,
}) => {
  const { data: history, isLoading } = useQuery<RecordHistoryResponse>({
    queryKey: ['record_history', recordId],
    queryFn: async () => {
      if (!recordId) throw new Error('No record ID')
      return await api.get<RecordHistoryResponse>(
        `/verification/records/${recordId}/history`
      )
    },
    enabled: isOpen && !!recordId,
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Immutable Version History & Audit Trail"
      subtitle={`Record ID: ${recordId || ''} • Patient: ${history?.patient_name || 'Loading...'}`}
      maxWidth="lg"
      footer={
        <div className="flex justify-end w-full">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-2xs text-slate-500 bg-slate-50 border border-slate-200 p-2 rounded">
          <span className="font-semibold text-slate-700">Append-Only Invariant:</span> Every revision, approval, rejection, and supersession is permanently preserved with full timestamps and actor provenance.
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <div className="w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading version trail...
          </div>
        ) : !history || history.versions.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No revision history found for this record.
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {history.versions.map((ver, idx) => {
              const isLatest = idx === history.versions.length - 1
              return (
                <div
                  key={ver.version_id}
                  className={`p-3.5 rounded border text-xs transition-colors ${
                    ver.status === 'approved'
                      ? 'border-emerald-300 bg-emerald-50/20'
                      : ver.status === 'superseded'
                      ? 'border-slate-200 bg-slate-50/60 opacity-80'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {/* Top Version Row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        v{ver.version_number}
                      </span>
                      <span className="font-semibold text-slate-800">{ver.title}</span>
                      {isLatest && (
                        <span className="text-2xs font-mono px-1 rounded bg-teal-100 text-teal-800 font-medium">
                          Current Head
                        </span>
                      )}
                    </div>
                    <StatusChip status={ver.status} size="sm" />
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs text-slate-600 bg-white p-2 rounded border border-slate-200 mb-2">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Submitted by:{' '}
                        <span className="font-medium text-slate-800">
                          {ver.submitter_name || ver.submitted_by || 'System AI'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Submitted:{' '}
                        <span className="font-mono text-slate-700">
                          {new Date(ver.submitted_at).toLocaleString()}
                        </span>
                      </span>
                    </div>
                    {ver.reviewed_by && (
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>
                          Verifier:{' '}
                          <span className="font-medium text-slate-800">
                            {ver.reviewer_name || ver.reviewed_by}
                          </span>
                        </span>
                      </div>
                    )}
                    {ver.reviewed_at && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>
                          Reviewed:{' '}
                          <span className="font-mono text-slate-700">
                            {new Date(ver.reviewed_at).toLocaleString()}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Rationale or Decision note */}
                  {ver.review_reason && (
                    <div className="p-2 rounded bg-slate-50 border border-slate-200 text-2xs space-y-0.5">
                      <span className="font-semibold text-slate-700 uppercase tracking-wider block">
                        Reviewer Rationale:
                      </span>
                      <p className="text-slate-800 italic">"{ver.review_reason}"</p>
                    </div>
                  )}

                  {/* Superseded Link */}
                  {ver.superseded_by && (
                    <div className="mt-2 text-2xs font-mono text-slate-400 flex items-center gap-1">
                      <span>Superseded by:</span>
                      <span className="text-slate-600">{ver.superseded_by}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
