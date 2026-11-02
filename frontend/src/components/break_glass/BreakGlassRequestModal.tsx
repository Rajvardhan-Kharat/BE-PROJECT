import React, { useState } from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'
import { api } from '../../services/api'
import type { BreakGlassReasonCategory } from '../../types/break_glass'

export interface BreakGlassRequestModalProps {
  isOpen?: boolean
  onClose: () => void
  patientId: string
  patientName?: string
  onSubmit?: (params: {
    justification: string
    reasonCategory: BreakGlassReasonCategory
    durationMinutes: number
  }) => Promise<void>
  onSuccess?: () => void
  isLoading?: boolean
}

const REASON_CATEGORIES: { value: BreakGlassReasonCategory; label: string; description: string }[] = [
  {
    value: 'acute_resuscitation',
    label: 'Acute Resuscitation Protocol',
    description: 'Patient undergoing active CPR, defibrillation, or emergent resuscitation',
  },
  {
    value: 'unconscious_patient',
    label: 'Unconscious / Unresponsive Patient',
    description: 'Patient unable to provide medical history or consent due to altered mental status',
  },
  {
    value: 'trauma_stat',
    label: 'Trauma Stat / Code Red Intake',
    description: 'Acute severe trauma with immediate risk of death or irreversible morbidity',
  },
  {
    value: 'immediate_threat_to_life',
    label: 'Immediate Threat to Life or Limb',
    description: 'Anaphylaxis, acute myocardial infarction, severe stroke, or vascular crisis',
  },
  {
    value: 'missing_critical_history',
    label: 'Missing Critical Emergency History',
    description: 'Missing allergy or medication list creating acute clinical risk during emergency treatment',
  },
]

export const BreakGlassRequestModal: React.FC<BreakGlassRequestModalProps> = ({
  isOpen = true,
  onClose,
  patientId,
  patientName = 'Unknown Patient',
  onSubmit,
  onSuccess,
  isLoading = false,
}) => {
  const [reasonCategory, setReasonCategory] = useState<BreakGlassReasonCategory>('acute_resuscitation')
  const [justification, setJustification] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (justification.trim().length < 10) {
      setErrorMsg('Mandatory clinical justification must be at least 10 characters long.')
      return
    }

    try {
      setIsSubmitting(true)
      if (onSubmit) {
        await onSubmit({
          justification: justification.trim(),
          reasonCategory,
          durationMinutes,
        })
      } else {
        await api.post('/break-glass/request', {
          patient_id: patientId,
          justification: justification.trim(),
          reason_category: reasonCategory,
          duration_minutes: durationMinutes,
        })
      }
      onSuccess?.()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to activate break-glass session.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white border-2 border-rose-500 rounded max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="bg-rose-950 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide uppercase">
                Emergency Break-Glass Override
              </h2>
              <p className="text-[11px] text-rose-300">
                Patient: <span className="font-semibold">{patientName}</span> ({patientId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-rose-300 hover:text-white p-1 rounded transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          {/* Warning Banner */}
          <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-950 text-[11px] space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              LEGAL & GOVERNANCE AUDIT INVARIANT
            </div>
            <p className="leading-relaxed">
              Break-glass emergency override provides a strictly limited view (acute summary, allergies, current medications).
              This action generates an <strong>immutable high-priority audit record</strong>, delivers an <strong>in-app patient alert</strong>,
              and requires <strong>mandatory administrative review</strong>. Access to raw Aria data and private notes remains strictly prohibited.
            </p>
          </div>

          {errorMsg && (
            <Banner variant="critical">
              {errorMsg}
            </Banner>
          )}

          {/* Reason Category */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800 block text-xs">
              Emergency Urgency Category <span className="text-rose-600">*</span>
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value as BreakGlassReasonCategory)}
              className="w-full text-xs bg-white border border-slate-300 rounded p-2 focus:ring-1 focus:ring-rose-600 focus:outline-none"
            >
              {REASON_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 italic">
              {REASON_CATEGORIES.find((c) => c.value === reasonCategory)?.description}
            </p>
          </div>

          {/* Justification Text */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 block text-xs">
                Clinical Justification <span className="text-rose-600">*</span>
              </label>
              <span className={`text-[10px] font-mono ${justification.trim().length < 10 ? 'text-rose-600' : 'text-slate-500'}`}>
                {justification.trim().length}/1000 (min 10)
              </span>
            </div>
            <textarea
              rows={4}
              placeholder="State the acute clinical circumstances requiring emergency break-glass override..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded p-2 font-mono focus:bg-white focus:ring-1 focus:ring-rose-600 focus:outline-none"
              required
            />
          </div>

          {/* Duration Selector */}
          <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <div>
                <span className="font-semibold text-slate-800 text-xs block">Emergency Session Window</span>
                <span className="text-[11px] text-slate-500">Auto-expires after requested duration</span>
              </div>
            </div>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="text-xs bg-white border border-slate-300 rounded px-2 py-1"
            >
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes (Default)</option>
              <option value={120}>120 minutes (Extended)</option>
            </select>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isLoading || isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={isLoading || isSubmitting}
              disabled={justification.trim().length < 10}
              icon={<ShieldAlert className="w-4 h-4" />}
            >
              Confirm Emergency Break-Glass
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
