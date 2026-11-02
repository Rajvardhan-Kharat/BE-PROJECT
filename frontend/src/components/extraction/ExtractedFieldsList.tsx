import React, { useState } from 'react'
import {
  FileEdit,
  Check,
  X,
  MapPin,
  HelpCircle,
  Undo2,
  Filter,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { ExtractionStatusChip } from '../ui/ExtractionStatusChip'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { ExtractedField, ExtractionFieldStatus } from '../../types/document'

interface ExtractedFieldsListProps {
  fields: ExtractedField[]
  selectedFieldName: string | null
  onSelectField: (fieldName: string) => void
  onSaveCorrection: (fieldName: string, correctedValue: any, reason: string) => void
  onRevertCorrection?: (fieldName: string) => void
  className?: string
}

const COMMON_CORRECTION_REASONS = [
  'Misread clinical dosage / frequency',
  'Negation or contraindication missed by AI',
  'Typo or OCR truncation in source text',
  'Ambiguous clinical abbreviation',
  'Incorrect diagnostic code mapping',
  'Other clinical verifier adjustment',
]

export const ExtractedFieldsList: React.FC<ExtractedFieldsListProps> = ({
  fields,
  selectedFieldName,
  onSelectField,
  onSaveCorrection,
  onRevertCorrection,
  className,
}) => {
  const [editingFieldName, setEditingFieldName] = useState<string | null>(null)
  const [correctedValue, setCorrectedValue] = useState<string>('')
  const [correctionReason, setCorrectionReason] = useState<string>(COMMON_CORRECTION_REASONS[0])
  const [customReason, setCustomReason] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExtractionFieldStatus>('ALL')

  const handleStartEdit = (field: ExtractedField, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingFieldName(field.field_name)
    setCorrectedValue(
      field.human_correction
        ? String(field.human_correction.corrected_value)
        : String(field.value ?? '')
    )
    setCorrectionReason(COMMON_CORRECTION_REASONS[0])
    setCustomReason('')
  }

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingFieldName(null)
    setCorrectedValue('')
  }

  const handleSaveEdit = (fieldName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const finalReason =
      correctionReason === 'Other clinical verifier adjustment' && customReason.trim()
        ? customReason.trim()
        : correctionReason

    onSaveCorrection(fieldName, correctedValue, finalReason)
    setEditingFieldName(null)
  }

  const filteredFields = fields.filter((f) => {
    if (statusFilter === 'ALL') return true
    return f.status === statusFilter
  })

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white border border-slate-300 rounded overflow-hidden select-text',
        className
      )}
    >
      {/* Header bar */}
      <div className="h-9 px-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs select-none shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <span>Extracted Clinical Fields</span>
          <span className="text-2xs font-mono font-medium px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
            {fields.length}
          </span>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1 text-2xs">
          <Filter className="w-3 h-3 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-2xs bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-slate-700 focus:outline-none focus:border-teal-700"
          >
            <option value="ALL">All Statuses ({fields.length})</option>
            <option value="explicit">Explicit</option>
            <option value="inferred">Inferred</option>
            <option value="uncertain">Uncertain</option>
            <option value="missing">Missing</option>
            <option value="conflicting">Conflicting</option>
          </select>
        </div>
      </div>

      {/* Fields List Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-slate-50/50">
        {filteredFields.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No extracted fields matching selected filter.
          </div>
        ) : (
          filteredFields.map((field) => {
            const isSelected = field.field_name === selectedFieldName
            const isEditing = field.field_name === editingFieldName
            const hasCorrection = !!field.human_correction

            return (
              <div
                key={field.field_name}
                data-testid={`field-card-${field.field_name}`}
                onClick={() => onSelectField(field.field_name)}
                className={cn(
                  'p-2.5 bg-white border rounded transition-all cursor-pointer relative text-left',
                  isSelected
                    ? 'border-teal-700 bg-teal-50/30 ring-1 ring-teal-700 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70',
                  hasCorrection && 'border-l-4 border-l-teal-700'
                )}
              >
                {/* Field Top Row: Name, Status, Action */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 tracking-tight capitalize">
                      {field.field_name.replace(/_/g, ' ')}
                    </span>
                    {hasCorrection && (
                      <span className="inline-flex items-center gap-0.5 text-2xs font-mono font-medium px-1.5 py-0.2 rounded bg-teal-100 text-teal-900 border border-teal-300">
                        <FileEdit className="w-2.5 h-2.5 text-teal-700" />
                        Human Corrected
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <ExtractionStatusChip status={field.status} size="sm" />
                    {hasCorrection && onRevertCorrection && !isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRevertCorrection(field.field_name)
                        }}
                        className="h-5 px-1.5 text-2xs text-slate-500 hover:text-rose-700"
                        title="Revert human correction"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Revert</span>
                      </Button>
                    )}
                    {!isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleStartEdit(field, e)}
                        className="h-5 px-1.5 text-2xs text-slate-500 hover:text-slate-900"
                        title="Edit value as human reviewer"
                      >
                        <FileEdit className="w-3 h-3" />
                        <span>Edit</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Field Value Display */}
                <div className="text-xs mb-1.5">
                  {isEditing ? (
                    /* Inline Editing Mode */
                    <div
                      className="p-2 bg-slate-50 border border-slate-300 rounded space-y-2 mt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-2xs font-semibold text-slate-700 uppercase tracking-wider">
                        Human Clinical Correction
                      </div>

                      <div className="text-2xs text-slate-500">
                        Original AI extraction:{' '}
                        <span className="font-mono text-slate-800 font-medium">
                          {String(field.human_correction?.original_value ?? field.value ?? 'None')}
                        </span>
                      </div>

                      <Input
                        size="sm"
                        label="Corrected Value"
                        value={correctedValue}
                        onChange={(e) => setCorrectedValue(e.target.value)}
                        placeholder="Enter verified clinical value..."
                        autoFocus
                      />

                      <div>
                        <label className="block text-2xs font-medium text-slate-700 mb-1">
                          Reason for Correction
                        </label>
                        <select
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 focus:outline-none focus:border-teal-700"
                        >
                          {COMMON_CORRECTION_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>

                      {correctionReason === 'Other clinical verifier adjustment' && (
                        <Input
                          size="sm"
                          placeholder="Specify custom clinical rationale..."
                          value={customReason}
                          onChange={(e) => setCustomReason(e.target.value)}
                        />
                      )}

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => handleCancelEdit(e)}
                          className="h-6 px-2 text-2xs"
                        >
                          <X className="w-3 h-3" />
                          <span>Cancel</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={(e) => handleSaveEdit(field.field_name, e)}
                          className="h-6 px-2 text-2xs"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save correction</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Normal Display Mode */
                    <div>
                      {hasCorrection ? (
                        <div className="space-y-0.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xs text-slate-400 line-through">
                              {String(field.human_correction!.original_value ?? 'None')}
                            </span>
                            <span className="font-semibold text-slate-900 text-xs">
                              {String(field.human_correction!.corrected_value)}
                            </span>
                          </div>
                          <div className="text-2xs text-teal-800 italic">
                            Reason: {field.human_correction!.reason}
                          </div>
                        </div>
                      ) : (
                        <span className="font-medium text-slate-900 text-xs">
                          {field.value !== null && field.value !== undefined
                            ? String(field.value)
                            : <span className="text-slate-400 italic">Missing from document</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Confidence note / reasoning */}
                {field.confidence_note && (
                  <div className="text-2xs text-slate-600 mb-1 leading-snug flex items-start gap-1">
                    <HelpCircle className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                    <span>{field.confidence_note}</span>
                  </div>
                )}

                {/* Source Span Grounding Pill */}
                {field.source_span && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 text-2xs text-slate-500 font-mono">
                    <MapPin className="w-3 h-3 text-teal-700 shrink-0" />
                    <span className="font-medium text-slate-700">
                      Page {field.source_span.page} [{field.source_span.start}:{field.source_span.end}]
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 truncate italic">
                      "{field.source_span.quote}"
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
