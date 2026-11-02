import React, { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'
import type { DecisionType } from '../../types/verification'

interface VerificationDecisionModalProps {
  isOpen: boolean
  onClose: () => void
  decision: DecisionType | null
  recordTitle: string
  versionNumber: number
  onConfirm: (reason: string, modifications?: Record<string, any>) => void
  isSubmitting?: boolean
  verifierName?: string
  verifierRole?: string
}

export const VerificationDecisionModal: React.FC<VerificationDecisionModalProps> = ({
  isOpen,
  onClose,
  decision,
  recordTitle,
  versionNumber,
  onConfirm,
  isSubmitting = false,
  verifierName = 'Clinical Verifier',
  verifierRole = 'Senior Doctor',
}) => {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  if (!decision) return null

  const isReject = decision === 'rejected'
  const isCorrection = decision === 'requires_correction'
  const isApprove = decision === 'approved'

  const title = isApprove
    ? 'Approve & Commit Clinical Record'
    : isReject
    ? 'Reject Untrusted Proposal'
    : 'Request Clinical Correction'

  const subtitle = `Version ${versionNumber} • ${recordTitle}`

  const handleConfirm = () => {
    if ((isReject || isCorrection) && reason.trim().length < 5) {
      setValidationError('A detailed clinical reason (min 5 characters) is mandatory.')
      return
    }
    setValidationError(null)
    onConfirm(reason.trim())
  }

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-1.5 text-2xs text-slate-500">
        <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
        <span>Decision will be logged to immutable audit trail</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isSubmitting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant={isApprove ? 'primary' : 'danger'}
          size="sm"
          loading={isSubmitting}
          onClick={handleConfirm}
          icon={
            isApprove ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : isReject ? (
              <XCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )
          }
        >
          {isApprove
            ? 'Confirm Approval'
            : isReject
            ? 'Confirm Rejection'
            : 'Submit Correction Request'}
        </Button>
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Context Banner */}
        {isApprove && (
          <Banner variant="info" compact>
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="text-2xs text-slate-700">
                Approving this record creates a new immutable version in the trusted clinical collection and marks the previous approved version superseded. Approved data will appear on the patient's trusted timeline.
              </div>
            </div>
          </Banner>
        )}

        {(isReject || isCorrection) && (
          <Banner variant="warning" compact>
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-2xs text-slate-700">
                <span className="font-semibold text-slate-900">Governance Policy:</span> A detailed rationale is mandatory when rejecting proposals or requesting modifications from clinicians.
              </div>
            </div>
          </Banner>
        )}

        {/* Verifier Credentials Badge */}
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex items-center justify-between">
          <div>
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Verifier Credentials
            </span>
            <span className="font-semibold text-slate-800">{verifierName}</span>
            <span className="text-slate-500 text-2xs ml-1.5 font-mono">({verifierRole})</span>
          </div>
          <span className="text-2xs font-mono font-medium px-2 py-0.5 rounded bg-white text-teal-800 border border-slate-300">
            Four-Eyes Enforced
          </span>
        </div>

        {/* Reason Input Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            {isApprove ? (
              <span>Verification Note <span className="text-slate-400 font-normal">(Optional)</span></span>
            ) : (
              <span>Clinical Rationale <span className="text-rose-600">* (Mandatory)</span></span>
            )}
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (validationError) setValidationError(null)
            }}
            placeholder={
              isApprove
                ? 'Optional clinical confirmation note (e.g. Telemetry rhythm verified against discharge summary)...'
                : isReject
                ? 'Specify precise clinical reason for rejection (e.g. Incompatible diagnosis with lab pathology)...'
                : 'Detail required corrections for clinician author (e.g. Dosage unit ambiguous, verify whether BID or TID)...'
            }
            className={`w-full text-xs p-2.5 rounded border focus:outline-none transition-colors font-sans ${
              validationError
                ? 'border-rose-500 bg-rose-50/20 text-slate-900 focus:border-rose-600'
                : 'border-slate-300 bg-white text-slate-900 focus:border-teal-700'
            }`}
          />
          {validationError && (
            <p className="text-2xs text-rose-600 mt-1 font-medium">{validationError}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
