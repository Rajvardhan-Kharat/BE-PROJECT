import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'
import type { TimelineConflict } from '../../types/timeline_audit'
import { AlertTriangle, CheckCircle, Building2, Calendar } from 'lucide-react'

interface TimelineConflictResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (resolutionAction: string, reason: string) => Promise<void>
  conflict: TimelineConflict | null
}

export const TimelineConflictResolutionModal: React.FC<TimelineConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  conflict,
}) => {
  const [action, setAction] = useState('confirm_discontinuation')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setAction('confirm_discontinuation')
      setReason('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  if (!conflict) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim() || reason.trim().length < 3) {
      setError('A clinical justification (minimum 3 characters) is strictly mandatory.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      await onConfirm(action, reason.trim())
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record conflict resolution')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Resolve Timeline Clinical Conflict"
      subtitle="Preserve historical integrity while documenting official clinical reconciliation."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-2xs text-slate-500 font-mono">
            Rule: {conflict.rule_id} • Audited
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !reason.trim()}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
            >
              {isSubmitting ? 'Recording Decision...' : 'Confirm Resolution'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Banner variant="critical" title="Validation Error">
            {error}
          </Banner>
        )}

        {/* Warning Banner: Newest is NOT assumed correct */}
        <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Clinical Warning: Do NOT assume newest import is correct</span>
          </div>
          <p className="text-2xs text-amber-900 leading-relaxed">
            {conflict.warning}
          </p>
        </div>

        {/* Conflict Chronology Comparison (3+ Sources & Dates) */}
        <div className="space-y-2">
          <label className="block text-2xs font-bold uppercase tracking-wider text-slate-500">
            Chronological Evidence Sequence ({conflict.dates.length} Points in Time)
          </label>
          <div className="space-y-2">
            {conflict.events_involved.map((ev, idx) => (
              <div
                key={ev.event_id || idx}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-2xs font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {ev.date}
                    </span>
                    <span className="font-semibold text-slate-900">{ev.source}</span>
                  </div>
                  <div className="text-2xs text-slate-500 flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {ev.hospital_name} ({ev.department})
                    </span>
                    {ev.provider_name && <span>• Clinician: {ev.provider_name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span
                    className={`font-mono text-2xs uppercase px-2 py-0.5 rounded border font-semibold ${
                      ev.status === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {ev.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Choice */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">
            Clinical Decision Action <span className="text-rose-600">*</span>
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-teal-700"
          >
            <option value="confirm_discontinuation">
              Confirm Specialist Discontinuation (Retire Stale External Import)
            </option>
            <option value="maintain_active">
              Maintain Active Therapy (Re-evaluate and issue updated clinical order)
            </option>
            <option value="accept_imported_status">
              Accept External Chart Import (Document clinical reason for restart)
            </option>
            <option value="custom_clinical_override">
              Custom Clinical Reconciliation Plan
            </option>
          </select>
        </div>

        {/* Mandatory Clinical Rationale */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">
            Mandatory Clinical Rationale <span className="text-rose-600">*</span>
          </label>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Document clinical reconciliation rationale (e.g. Attending clinician confirmed specialist discontinuation holds; external facility import was based on outdated outpatient list without telemetry review)..."
            className="w-full text-xs font-sans p-2.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 bg-white placeholder:text-slate-400"
            autoFocus
          />
          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span>Will be recorded in the append-only audit trail with your user identity and timestamp.</span>
            <span>{reason.length} chars</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
