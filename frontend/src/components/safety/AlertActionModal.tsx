import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'
import type { ClinicalAlert } from '../../types/safety'
import { CheckCircle, ShieldAlert } from 'lucide-react'

interface AlertActionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
  alert: ClinicalAlert | null
  actionType: 'dismiss' | 'resolve'
}

export const AlertActionModal: React.FC<AlertActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  alert,
  actionType,
}) => {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setReason('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  if (!alert) return null

  const isDismiss = actionType === 'dismiss'
  const title = isDismiss ? 'Dismiss Clinical Safety Alert' : 'Resolve Clinical Safety Alert'
  const subtitle = isDismiss
    ? 'Record clinical justification for acknowledging alert without modifying orders.'
    : 'Record corrective action taken to remediate the identified clinical conflict.'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim() || reason.trim().length < 3) {
      setError('A specific clinical reason (minimum 3 characters) is strictly mandatory.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      await onConfirm(reason.trim())
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update alert state')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={isDismiss ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim()}
            icon={isDismiss ? <ShieldAlert className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
          >
            {isSubmitting ? 'Recording...' : isDismiss ? 'Confirm Dismissal' : 'Mark Resolved'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Banner variant="critical" title="Validation Error">
            {error}
          </Banner>
        )}

        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
              Rule: {alert.rule_id}
            </span>
            <span className="text-2xs text-slate-500 font-mono">v{alert.rule_version}</span>
          </div>
          <h4 className="font-semibold text-slate-900">{alert.title}</h4>
          <p className="text-slate-600 text-2xs leading-relaxed">{alert.explanation}</p>
        </div>

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
            placeholder={
              isDismiss
                ? 'State clinical rationale (e.g., patient tolerating co-prescription under regular telemetry; specialist approved).'
                : 'State remediation performed (e.g., discontinued duplicate order; substituted non-interacting agent).'
            }
            className="w-full text-xs font-sans p-2.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 bg-white placeholder:text-slate-400"
            autoFocus
          />
          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span>Audit log will record your user identity, role, timestamp, and rationale.</span>
            <span>{reason.length} chars</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
