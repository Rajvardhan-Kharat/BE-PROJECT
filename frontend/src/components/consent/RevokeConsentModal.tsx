import React, { useState } from 'react'
import { AlertTriangle, X, ShieldX } from 'lucide-react'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'
import type { PatientConsentResponse } from '../../types/consent'

interface RevokeConsentModalProps {
  isOpen: boolean
  onClose: () => void
  consent: PatientConsentResponse | null
  onRevoke: (consentId: string, reason: string) => Promise<void>
  isLoading?: boolean
}

export const RevokeConsentModal: React.FC<RevokeConsentModalProps> = ({
  isOpen,
  onClose,
  consent,
  onRevoke,
  isLoading = false,
}) => {
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen || !consent) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (reason.trim().length < 5) {
      setErrorMsg('Mandatory reason for revocation must be at least 5 characters.')
      return
    }

    try {
      await onRevoke(consent.consent_id, reason.trim())
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to revoke consent directive.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border-2 border-amber-500 rounded max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="bg-amber-950 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldX className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold tracking-wide uppercase">
              Revoke Consent Directive
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-amber-300 hover:text-white p-1 rounded"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-950 text-[11px] space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              Immediate Backend Sharing Block
            </div>
            <p>
              Revoking consent <strong>immediately blocks</strong> all non-emergency reads and queries for{' '}
              <span className="font-mono font-semibold">{consent.recipient}</span> across categories:{' '}
              <span className="font-mono">{consent.categories.join(', ')}</span>.
            </p>
          </div>

          {errorMsg && <Banner variant="critical">{errorMsg}</Banner>}

          <div className="space-y-1">
            <label className="font-semibold text-slate-800 block text-xs">
              Mandatory Revocation Reason <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="State clinical or personal reason for revoking this data sharing directive..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded p-2 focus:bg-white focus:ring-1 focus:ring-amber-600 focus:outline-none"
              required
            />
            <span className="text-[10px] text-slate-500 block">Minimum 5 characters required</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={isLoading}
              disabled={reason.trim().length < 5}
              icon={<ShieldX className="w-3.5 h-3.5" />}
            >
              Confirm Revocation
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
