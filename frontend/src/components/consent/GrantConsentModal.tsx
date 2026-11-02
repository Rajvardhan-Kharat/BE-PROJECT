import React, { useState } from 'react'
import { FileKey, X, CheckCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'

interface GrantConsentModalProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  onSubmit: (params: {
    recipient: string
    purpose: string
    categories: string[]
    textVersion: string
  }) => Promise<void>
  isLoading?: boolean
}

const AVAILABLE_CATEGORIES = [
  { id: '*', label: 'All Health Data Categories (*)' },
  { id: 'allergies', label: 'Allergies & Adverse Reactions' },
  { id: 'medications', label: 'Active & Historical Medications' },
  { id: 'diagnoses', label: 'Diagnoses & Problem Lists' },
  { id: 'vitals', label: 'Vital Signs' },
  { id: 'encounter_notes', label: 'Clinical Encounter Notes' },
  { id: 'lab_results', label: 'Laboratory & Diagnostic Reports' },
]

export const GrantConsentModal: React.FC<GrantConsentModalProps> = ({
  isOpen,
  onClose,
  patientId,
  onSubmit,
  isLoading = false,
}) => {
  const [recipient, setRecipient] = useState('HOSP-VALLEY-02')
  const [purpose, setPurpose] = useState('treatment')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['*'])
  const textVersion = 'v1.0-synthetic-clinical-consent'
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const toggleCategory = (catId: string) => {
    if (catId === '*') {
      setSelectedCategories(['*'])
      return
    }
    const filtered = selectedCategories.filter((c) => c !== '*')
    if (filtered.includes(catId)) {
      const remaining = filtered.filter((c) => c !== catId)
      setSelectedCategories(remaining.length > 0 ? remaining : ['*'])
    } else {
      setSelectedCategories([...filtered, catId])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!recipient.trim()) {
      setErrorMsg('Please specify a recipient organization or provider ID.')
      return
    }

    try {
      await onSubmit({
        recipient: recipient.trim(),
        purpose,
        categories: selectedCategories,
        textVersion,
      })
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to grant consent directive.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-300 rounded max-w-lg w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="bg-teal-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileKey className="w-4 h-4 text-teal-300" />
            <div>
              <h2 className="text-xs font-bold tracking-wide uppercase">
                Grant Clinical Data Sharing Directive
              </h2>
              <span className="text-[10px] text-teal-200 font-mono">Patient: {patientId}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-teal-300 hover:text-white p-1 rounded"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          {errorMsg && <Banner variant="critical">{errorMsg}</Banner>}

          <div className="space-y-1">
            <label className="font-semibold text-slate-800 block text-xs">
              Recipient Organization / Care Team <span className="text-teal-700">*</span>
            </label>
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none"
            >
              <option value="*">General Clinical Care Team (*)</option>
              <option value="HOSP-METRO-01">Metro Health University Medical Center (HOSP-METRO-01)</option>
              <option value="HOSP-VALLEY-02">Valley Memorial Community Hospital (HOSP-VALLEY-02)</option>
              <option value="all_care_team">All Care Team Clinicians (all_care_team)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-800 block text-xs">
              Purpose of Data Use <span className="text-teal-700">*</span>
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none"
            >
              <option value="treatment">Clinical Treatment & Diagnosis</option>
              <option value="emergency">Emergency Care</option>
              <option value="referral">Specialist Referral</option>
              <option value="care_coordination">Cross-Hospital Care Coordination</option>
              <option value="research">Anonymized Academic Research</option>
              <option value="*">All Valid Purposes (*)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-800 block text-xs mb-1">
              Covered Data Categories
            </label>
            <div className="grid grid-cols-1 gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded max-h-36 overflow-y-auto">
              {AVAILABLE_CATEGORIES.map((cat) => (
                <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="rounded border-slate-300 text-teal-800 focus:ring-teal-700"
                  />
                  <span className="text-slate-800">{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-2xs text-slate-500 pt-1 border-t border-slate-200">
            <span>Agreement Version: <span className="font-mono text-slate-700">{textVersion}</span></span>
            <span>Effective immediately</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isLoading}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
            >
              Grant Directive
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
