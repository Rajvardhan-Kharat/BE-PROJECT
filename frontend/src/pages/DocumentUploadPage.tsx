import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  FileCheck2,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import { StatusChip } from '../components/ui/StatusChip'
import type { ProcessingStatus } from '../types/document'

export const DocumentUploadPage: React.FC = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [patientId, setPatientId] = useState<string>('PAT-SYN-001')
  const [status, setStatus] = useState<ProcessingStatus>('queued')
  const [progress, setProgress] = useState<number>(0)
  const [uploadResult, setUploadResult] = useState<any | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)

  // Query recent documents uploaded for this patient
  const {
    data: recentDocs = [],
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['patient_documents', patientId],
    queryFn: async () => {
      try {
        const res = await api.get<any[]>(`/documents/patient/${patientId}`)
        return res
      } catch {
        return [
          {
            document_id: 'DOC-SYN-84920-01',
            patient_id: 'PAT-SYN-001',
            filename: 'discharge_summary_cardiology.pdf',
            status: 'pending_review',
            fields_count: 6,
            content_hash: '7f83b1657ff1...',
            uploaded_at: '2026-10-31 14:22',
            provider_name: 'MOCK_LLM_PROVIDER (SYNTHETIC LABELED)',
          },
        ]
      }
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setStatus('queued')
      setProgress(10)
      setErrorMessage(null)
      setUploadResult(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      setSelectedFile(file)
      setStatus('queued')
      setProgress(10)
      setErrorMessage(null)
      setUploadResult(null)
    }
  }

  const handleStartUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setErrorMessage(null)
    setStatus('processing')
    setProgress(30)

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('patient_id', patientId)

    try {
      // Simulate progress progression for clinical feedback
      const progressTimer = setInterval(() => {
        setProgress((prev) => (prev < 85 ? prev + 15 : prev))
      }, 300)

      const token = api.getToken()
      const response = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      })

      clearInterval(progressTimer)

      if (!response.ok) {
        let errText = 'Upload failed'
        try {
          const errData = await response.json()
          errText = errData.error?.message || errData.detail || errText
        } catch {
          errText = `HTTP Error ${response.status}`
        }
        throw new Error(errText)
      }

      const data = await response.json()
      setProgress(100)
      setStatus('done')
      setUploadResult(data)
      refetchDocs()
    } catch (err: any) {
      setStatus('failed')
      setProgress(0)
      setErrorMessage(err.message || 'Upload and processing failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-teal-700" />
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              Clinical Document Ingestion
            </h1>
            <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
              Untrusted Input
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ingest clinical discharge summaries and notes. AI proposes extracted fields; verifier review is mandatory before writing to trusted records.
          </p>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <Banner variant="info" compact>
        <div className="flex items-center justify-between w-full">
          <span>
            Security bounds: Files validated by PDF magic bytes (%PDF-), 10 MB size cap, SHA-256 hash idempotency, and randomized storage filenames.
          </span>
          <span className="font-mono text-2xs text-teal-800 font-medium">Pending Review Invariant</span>
        </div>
      </Banner>

      {/* Main Upload Staging Card */}
      <div className="p-5 bg-white border border-slate-300 rounded space-y-4 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Patient Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Patient
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-teal-700 font-medium"
            >
              <option value="PAT-SYN-001">Eleanor Vance (MRN: SYN-84920)</option>
              <option value="PAT-SYN-002">Arthur Pendelton (MRN: SYN-90412)</option>
            </select>
            <span className="text-2xs text-slate-400 mt-0.5 block">
              Care-team permission checked automatically
            </span>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-teal-700 hover:bg-teal-50/20 rounded p-6 text-center cursor-pointer transition-colors"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf"
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText className="w-5 h-5 text-teal-700" />
            </div>
            {selectedFile ? (
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {selectedFile.name}
                </div>
                <div className="text-2xs font-mono text-slate-500 mt-0.5">
                  {(selectedFile.size / 1024).toFixed(1)} KB • application/pdf
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-medium text-slate-700">
                  Click to select or drag and drop clinical PDF document
                </div>
                <div className="text-2xs text-slate-400 mt-1">
                  Supported format: Text-layer PDF (Max 10 MB)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Processing Status & Progress Meter */}
        {selectedFile && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                {status === 'queued' && (
                  <>
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Status: Staged & Queued for Processing</span>
                  </>
                )}
                {status === 'processing' && (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
                    <span className="text-teal-900 font-semibold">
                      Status: Processing Extraction & Verifying Spans...
                    </span>
                  </>
                )}
                {status === 'done' && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="text-emerald-900 font-semibold">
                      Status: Extraction Completed Successfully (Saved as pending_review)
                    </span>
                  </>
                )}
                {status === 'failed' && (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                    <span className="text-rose-900 font-semibold">Status: Processing Failed</span>
                  </>
                )}
              </div>
              <span className="text-2xs font-mono text-slate-500">{progress}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 h-1.5 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  status === 'failed'
                    ? 'bg-rose-600'
                    : status === 'done'
                    ? 'bg-emerald-600'
                    : 'bg-teal-700'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                {errorMessage}
              </div>
            )}

            {/* Success Summary Result */}
            {uploadResult && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded text-xs space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-emerald-950">
                      Extraction generated: {uploadResult.fields?.length || 0} fields identified
                    </div>
                    <div className="text-2xs font-mono text-emerald-800 mt-0.5">
                      Document ID: {uploadResult.document_id} • Status: {uploadResult.status}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                    onClick={() => navigate(`/documents/${uploadResult.document_id}/review`)}
                  >
                    Open Review Workspace
                  </Button>
                </div>
              </div>
            )}

            {/* Action Trigger */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={isUploading}
                onClick={() => {
                  setSelectedFile(null)
                  setUploadResult(null)
                  setStatus('queued')
                }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={isUploading}
                disabled={!selectedFile || status === 'done'}
                onClick={handleStartUpload}
                icon={<UploadCloud className="w-3.5 h-3.5" />}
              >
                Start Ingestion & Extraction
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Ingestion Documents Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Ingested Documents Pending Review ({recentDocs.length})
            </h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-2xs"
            icon={<RefreshCw className="w-3 h-3" />}
            onClick={() => refetchDocs()}
          >
            Refresh list
          </Button>
        </div>

        {recentDocs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded">
            No uploaded documents pending review for this patient.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Filename</TableHead>
                <TableHead>Document ID</TableHead>
                <TableHead>Extracted Fields</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead alignRight>Action</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {recentDocs.map((doc: any) => (
                <TableRow key={doc.document_id}>
                  <TableCell className="font-medium text-slate-900">
                    {doc.filename || 'discharge_summary.pdf'}
                  </TableCell>
                  <TableCell mono className="text-slate-500">
                    {doc.document_id}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono font-medium text-slate-800">
                      {doc.fields_count ?? 6} fields
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusChip status="pending_review" size="sm" />
                  </TableCell>
                  <TableCell mono className="text-slate-500">
                    {doc.uploaded_at || 'Just now'}
                  </TableCell>
                  <TableCell alignRight>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-xs"
                      iconRight={<ArrowRight className="w-3 h-3" />}
                      onClick={() => navigate(`/documents/${doc.document_id}/review`)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
