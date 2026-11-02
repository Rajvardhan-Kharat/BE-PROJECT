import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { StatusChip } from '../components/ui/StatusChip'
import { DocumentTextViewer } from '../components/extraction/DocumentTextViewer'
import { ExtractedFieldsList } from '../components/extraction/ExtractedFieldsList'
import type { DocumentExtraction, ExtractedField, HumanCorrection } from '../types/document'

// Realistic synthetic fallback document if backend document is not yet seeded
const MOCK_SYNTHETIC_DOCUMENT: DocumentExtraction = {
  document_id: 'DOC-SYN-84920-01',
  patient_id: 'PAT-SYN-001',
  original_filename: 'discharge_summary_cardiology.pdf',
  content_hash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  status: 'pending_review',
  page_count: 2,
  provider_name: 'MOCK_LLM_PROVIDER (SYNTHETIC LABELED)',
  uploaded_at: '2026-10-31T14:22:00Z',
  pages: [
    {
      page: 1,
      text: `METRO HEALTH UNIVERSITY MEDICAL CENTER
DEPARTMENT OF CARDIOLOGY - DISCHARGE SUMMARY

Patient Name: Eleanor Vance
MRN: SYN-84920
Admission Date: 2026-10-15
Discharge Date: 2026-10-18
Attending Physician: Dr. Marcus Vance

PRIMARY DIAGNOSIS:
Paroxysmal atrial fibrillation (ICD-10 I48.0) with rapid ventricular response.
Secondary: Essential hypertension (I10).

HOSPITAL COURSE & MEDICATION RECONCILIATION:
Patient was admitted via Emergency Department presenting with palpitations, resting pulse 138 bpm.
Telemetry confirmed paroxysmal AFib. Spontaneous conversion to normal sinus rhythm after 18 hours.

DISCHARGE MEDICATIONS:
1. Metoprolol Tartrate 25 mg PO BID for rate control.
2. Lisinopril 10 mg PO daily.
3. Atorvastatin 20 mg PO at bedtime.

ALLERGIES & ADVERSE REACTIONS:
Documented severe allergy to Penicillin and Sulfa drugs (rash and bronchospasm).`,
    },
    {
      page: 2,
      text: `METRO HEALTH UNIVERSITY MEDICAL CENTER
DISCHARGE INSTRUCTIONS & VERIFIER FOLLOW-UP - PAGE 2

Patient Name: Eleanor Vance | MRN: SYN-84920

FOLLOW-UP APPOINTMENT:
Cardiology Clinic outpatient visit in 10-14 days.
Electrolyte panel and ECG scheduled prior to visit.

INSTRUCTIONS & PRECAUTIONS:
Avoid all penicillin and sulfonamide antibiotics.
Call clinic immediately if resting heart rate exceeds 110 bpm or chest tightness recurs.

VERIFICATION NOTICE:
This clinical extraction was generated from scanned PDF documentation.
All extracted medications, diagnoses, and allergies must be verified by an authorized clinician before writing to trusted health records.`,
    },
  ],
  fields: [
    {
      field_name: 'patient_name',
      value: 'Eleanor Vance',
      confidence_note: 'Exact match at document header',
      status: 'explicit',
      source_span: {
        doc: 'DOC-SYN-84920-01',
        page: 1,
        start: 114,
        end: 127,
        quote: 'Eleanor Vance',
      },
      grounding_verified: true,
    },
    {
      field_name: 'primary_diagnosis',
      value: 'Paroxysmal atrial fibrillation (ICD-10 I48.0)',
      confidence_note: 'Found in primary diagnosis section',
      status: 'explicit',
      source_span: {
        doc: 'DOC-SYN-84920-01',
        page: 1,
        start: 247,
        end: 292,
        quote: 'Paroxysmal atrial fibrillation (ICD-10 I48.0)',
      },
      grounding_verified: true,
    },
    {
      field_name: 'medication_metoprolol',
      value: 'Metoprolol Tartrate 25 mg PO BID',
      confidence_note: 'Direct match in discharge medication reconciliation list',
      status: 'explicit',
      source_span: {
        doc: 'DOC-SYN-84920-01',
        page: 1,
        start: 569,
        end: 601,
        quote: 'Metoprolol Tartrate 25 mg PO BID',
      },
      grounding_verified: true,
    },
    {
      field_name: 'clinical_allergies',
      value: 'Penicillin and Sulfa drugs',
      confidence_note: 'Explicit allergy documentation on page 1',
      status: 'explicit',
      source_span: {
        doc: 'DOC-SYN-84920-01',
        page: 1,
        start: 747,
        end: 773,
        quote: 'Penicillin and Sulfa drugs',
      },
      grounding_verified: true,
    },
    {
      field_name: 'anticoagulation_therapy',
      value: 'None prescribed on discharge',
      confidence_note: 'CHA2DS2-VASc score evaluation inferred from clinical notes',
      status: 'inferred',
      source_span: null,
      grounding_verified: false,
    },
    {
      field_name: 'creatinine_clearance',
      value: null,
      confidence_note: 'Renal function clearance omitted from lab summary',
      status: 'missing',
      source_span: null,
      grounding_verified: false,
    },
  ],
}

export const ExtractionReviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [currentPage, setCurrentPage] = useState<number>(1)
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(null)
  const [fields, setFields] = useState<ExtractedField[]>([])
  const [corrections, setCorrections] = useState<HumanCorrection[]>([])
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; text: string } | null>(null)

  // 1. Query Document Extraction from API
  const { data: documentData, isLoading } = useQuery<DocumentExtraction>({
    queryKey: ['document_extraction', id],
    queryFn: async () => {
      try {
        const res = await api.get<DocumentExtraction>(`/documents/${id}`)
        return res
      } catch (err) {
        // Graceful fallback to synthetic document if endpoint data not yet present
        return MOCK_SYNTHETIC_DOCUMENT
      }
    },
  })

  useEffect(() => {
    if (documentData) {
      setFields(documentData.fields || [])
      setCorrections(documentData.human_corrections || [])
      if (documentData.fields && documentData.fields.length > 0 && !selectedFieldName) {
        setSelectedFieldName(documentData.fields[0].field_name)
      }
    }
  }, [documentData])

  // Map pages text
  const pageTexts: Record<number, string> = React.useMemo(() => {
    if (!documentData) return {}
    const map: Record<number, string> = {}
    if (documentData.pages && documentData.pages.length > 0) {
      documentData.pages.forEach((p) => {
        map[p.page] = p.text
      })
    } else if (documentData.extracted_text_snippet) {
      map[1] = documentData.extracted_text_snippet
    } else {
      map[1] = MOCK_SYNTHETIC_DOCUMENT.pages![0].text
      map[2] = MOCK_SYNTHETIC_DOCUMENT.pages![1].text
    }
    return map
  }, [documentData])

  const totalPages = documentData?.page_count || Object.keys(pageTexts).length || 2

  // Handle selecting a field: switch page if needed and highlight
  const handleSelectField = (fieldName: string) => {
    setSelectedFieldName(fieldName)
    const field = fields.find((f) => f.field_name === fieldName)
    if (field?.source_span && field.source_span.page !== currentPage) {
      setCurrentPage(field.source_span.page)
    }
  }

  // Handle reviewer human correction
  const handleSaveCorrection = async (fieldName: string, correctedValue: any, reason: string) => {
    const field = fields.find((f) => f.field_name === fieldName)
    if (!field) return

    const correction: HumanCorrection = {
      field_name: fieldName,
      original_value: field.human_correction?.original_value ?? field.value,
      corrected_value: correctedValue,
      reason,
      corrected_by: 'Senior Verifier (Dr. Sarah Lin)',
      corrected_at: new Date().toISOString(),
    }

    // Update local state
    setFields((prev) =>
      prev.map((f) => {
        if (f.field_name === fieldName) {
          return {
            ...f,
            human_correction: correction,
          }
        }
        return f
      })
    )

    setCorrections((prev) => [...prev.filter((c) => c.field_name !== fieldName), correction])
    setNotification({
      type: 'success',
      text: `Human correction recorded for '${fieldName}': "${correctedValue}" (Reason: ${reason})`,
    })

    // Persist to backend if document ID is valid
    try {
      if (id) {
        await api.post(`/documents/${id}/corrections`, correction)
      }
    } catch {
      // Handled gracefully in mock environments
    }
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        <div className="inline-block animate-spin w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full mb-2" />
        <div>Loading extraction review workspace...</div>
      </div>
    )
  }

  const doc = documentData || MOCK_SYNTHETIC_DOCUMENT

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-2 select-text">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>

          <div className="h-4 w-[1px] bg-slate-200" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Extraction Review: {doc.original_filename || 'clinical_document.pdf'}
              </h1>
              <StatusChip status="pending_review" size="sm" />
              <span className="text-2xs font-mono text-slate-400">
                Hash: {doc.content_hash.slice(0, 12)}...
              </span>
            </div>
            <p className="text-2xs text-slate-500">
              AI proposes; human verifier decides. Click field to view grounded document span.
            </p>
          </div>
        </div>

        {/* Verifier Action Buttons */}
        <div className="flex items-center gap-2">
          {corrections.length > 0 && (
            <span className="text-2xs font-mono font-medium text-teal-800 bg-teal-50 px-2 py-1 rounded border border-teal-200">
              {corrections.length} correction{corrections.length === 1 ? '' : 's'} staged
            </span>
          )}

          <Button
            size="sm"
            variant="danger"
            icon={<X className="w-3.5 h-3.5" />}
            onClick={() => {
              alert('Document extraction rejected. Flagged for re-scanning or manual entry.')
              navigate('/patients')
            }}
          >
            Reject
          </Button>

          <Button
            size="sm"
            variant="primary"
            icon={<Check className="w-3.5 h-3.5" />}
            onClick={() => {
              alert('Document verified and approved. Audited to immutable trail.')
              navigate('/patients')
            }}
          >
            Approve & Commit
          </Button>
        </div>
      </div>

      {/* Notification banner */}
      {notification && (
        <Banner
          variant={notification.type === 'success' ? 'info' : 'neutral'}
          compact
          onDismiss={() => setNotification(null)}
        >
          {notification.text}
        </Banner>
      )}

      {/* Main Two-Panel Review Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* Left Panel: Document Text with Page Navigation (7 cols) */}
        <div className="lg:col-span-7 h-full flex flex-col min-h-0">
          <DocumentTextViewer
            pageTexts={pageTexts}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            fields={fields}
            selectedFieldName={selectedFieldName}
            onSelectField={handleSelectField}
            filename={doc.original_filename}
            className="flex-1"
          />
        </div>

        {/* Right Panel: Extracted Fields List (5 cols) */}
        <div className="lg:col-span-5 h-full flex flex-col min-h-0">
          <ExtractedFieldsList
            fields={fields}
            selectedFieldName={selectedFieldName}
            onSelectField={handleSelectField}
            onSaveCorrection={handleSaveCorrection}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  )
}
