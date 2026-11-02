import React, { useState } from 'react'
import { ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/Button'
import type { AriaNoticeStatus } from '../../types/aria'

interface AriaNoticeModalProps {
  notice: AriaNoticeStatus
  onAcknowledge: () => Promise<void>
}

export const AriaNoticeModal: React.FC<AriaNoticeModalProps> = ({ notice, onAcknowledge }) => {
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (!agreed) return
    setLoading(true)
    try {
      await onAcknowledge()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aria-notice-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="rounded-full bg-blue-50 p-2 text-blue-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2 id="aria-notice-title" className="text-lg font-semibold text-slate-900">
              Important Notice: Aria Mental Health Companion
            </h2>
            <p className="text-xs text-slate-500">
              Provider: <span className="font-mono font-medium text-slate-700">{notice.provider_label}</span>
              {notice.mode === 'mock' && (
                <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  MOCK / PLACEHOLDER MODE
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="my-4 space-y-3 text-xs leading-relaxed text-slate-700">
          <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-950">Not a Clinician or Diagnostic Tool</p>
                <p className="mt-0.5">
                  Aria is an automated companion and journal assistant. It is{' '}
                  <strong>not a licensed physician, therapist, or diagnostic instrument</strong>. It cannot provide medical diagnoses, prescribe treatments, or offer clinical emergency intervention.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="font-medium text-slate-900">Privacy & Data Boundaries:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>
                Your chat messages and private reflections are kept strictly isolated. They are{' '}
                <strong>never automatically inserted</strong> into your medical records, clinical timeline, or shared with hospital staff without your explicit review and approval.
              </li>
              <li>
                Identifiable information (such as your full name, MRN, and clinical history) is never transmitted to the external companion service; conversations use a pseudonymous identifier.
              </li>
              <li>
                You can generate a summary to share with your care team at any time, but you will always preview, edit, and approve that summary before anything is shared.
              </li>
            </ul>
          </div>

          <div className="rounded-md border border-red-200 bg-red-50/70 p-3 text-red-950">
            <p className="font-semibold text-red-900">Emergency & Crisis Services</p>
            <p className="mt-0.5">
              Aria is <strong>not monitored 24/7</strong> by healthcare staff. If you are experiencing thoughts of self-harm, severe distress, or a medical emergency, please immediately call 988 (USA/Canada), 911 / 112, Tele-MANAS (14416 / 1800-891-4416), or go to the nearest emergency department.
            </p>
          </div>

          {notice.mode === 'mock' && (
            <div className="rounded-md border border-slate-200 bg-slate-100 p-2.5 text-[11px] text-slate-600 font-mono">
              [DEVELOPER NOTE: System is currently running against MockAriaProvider for demonstration and safety boundary testing. No external AI model is active.]
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-800">
              I understand that Aria is a non-clinical companion, is not monitored in real time, and that I should contact emergency services if in crisis.
            </span>
          </label>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!agreed || loading}
              onClick={handleConfirm}
              className="flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {loading ? 'Recording...' : 'Acknowledge & Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
