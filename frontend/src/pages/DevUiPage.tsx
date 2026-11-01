import React, { useState } from 'react'
import {
  Search,
  Filter,
  Check,
  X,
  FileCheck2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import { StatusChip, type RecordStatus } from '../components/ui/StatusChip'
import { Banner } from '../components/ui/Banner'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'

interface ClinicalRecord {
  id: string
  patientId: string
  type: string
  source: string
  timestamp: string
  status: RecordStatus
  verifier: string
  confidence: string
}

const mockRecords: ClinicalRecord[] = [
  {
    id: 'REC-2026-0819',
    patientId: 'SYN-84920',
    type: 'Medication Reconciliation',
    source: 'Discharge Summary (PDF)',
    timestamp: '2026-10-31 14:22',
    status: 'pending_review',
    verifier: 'Dr. Sarah Lin (Verifier)',
    confidence: '0.94 (Aria)',
  },
  {
    id: 'REC-2026-0818',
    patientId: 'SYN-84920',
    type: 'Lab Result Panel (Metabolic)',
    source: 'HL7 Ingest Feed',
    timestamp: '2026-10-31 11:05',
    status: 'approved',
    verifier: 'Dr. Marcus Vance',
    confidence: '1.00 (Lab Direct)',
  },
  {
    id: 'REC-2026-0815',
    patientId: 'SYN-84920',
    type: 'Contraindication Alert: Warfarin + Aspirin',
    source: 'VeriCare Safety Rule #3',
    timestamp: '2026-10-30 09:14',
    status: 'requires_correction',
    verifier: 'Pending senior verifier',
    confidence: '0.98 (Safety Rule)',
  },
  {
    id: 'REC-2026-0812',
    patientId: 'SYN-84920',
    type: 'Clinical Encounter Note',
    source: 'Cardiology Intake Note',
    timestamp: '2026-10-29 16:40',
    status: 'draft',
    verifier: 'Unassigned',
    confidence: '—',
  },
  {
    id: 'REC-2026-0798',
    patientId: 'SYN-84920',
    type: 'Initial Assessment',
    source: 'OCR Extraction',
    timestamp: '2026-10-25 10:11',
    status: 'superseded',
    verifier: 'Dr. Sarah Lin',
    confidence: '0.88 (Aria)',
  },
  {
    id: 'REC-2026-0780',
    patientId: 'SYN-84920',
    type: 'Dose Calculation (Gentamicin)',
    source: 'Pharmacology AI Proposal',
    timestamp: '2026-10-22 08:30',
    status: 'rejected',
    verifier: 'Dr. Marcus Vance',
    confidence: '0.62 (Low confidence)',
  },
]

export const DevUiPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'empty'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [bannerVisible, setBannerVisible] = useState(true)

  const filteredRecords =
    activeTab === 'empty'
      ? []
      : mockRecords.filter((rec) => {
          if (activeTab === 'pending' && rec.status !== 'pending_review') return false
          if (!searchTerm) return true
          return (
            rec.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            rec.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            rec.source.toLowerCase().includes(searchTerm.toLowerCase())
          )
        })

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Design Tokens & UI Primitives
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Standard design primitives conforming to <span className="font-mono text-slate-700">docs/DESIGN.md</span>.
            Calm, dense, EHR-grade clinical density with hairline borders and single deep teal accent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModalOpen(true)}
            icon={<FileCheck2 className="w-3.5 h-3.5" />}
          >
            Open verification modal
          </Button>
        </div>
      </div>

      {/* Persistent Banners Preview */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          1. Banners & Notifications
        </h2>
        {bannerVisible && (
          <Banner
            variant="synthetic"
            title="Synthetic Clinical Environment"
            onDismiss={() => setBannerVisible(false)}
            action={
              <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-slate-800">
                Data policy
              </Button>
            }
          >
            All records, patient identifiers, and clinical decisions displayed below are synthetic mocks. AI proposes; backend enforces; human verifiers decide.
          </Banner>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Banner variant="info" title="Verification rule active">
            Care team consent verified for Oncology Team 4.
          </Banner>
          <Banner variant="warning" title="Missing data warning">
            Missing creatinine clearance is not negative; verifier review required.
          </Banner>
          <Banner variant="critical" title="Prescription conflict">
            Dual anticoagulant order detected: Warfarin and Clopidogrel.
          </Banner>
        </div>
      </section>

      {/* Status Chips */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          2. Clinical Status Chips (All 6 Lifecycle States)
        </h2>
        <div className="p-3 bg-white border border-slate-200 rounded flex flex-wrap items-center gap-3">
          <StatusChip status="draft" />
          <StatusChip status="pending_review" />
          <StatusChip status="approved" />
          <StatusChip status="rejected" />
          <StatusChip status="superseded" />
          <StatusChip status="requires_correction" />
          <div className="h-4 w-[1px] bg-slate-200 mx-1" />
          <span className="text-2xs text-slate-400 font-mono">Compact size (sm):</span>
          <StatusChip status="pending_review" size="sm" />
          <StatusChip status="approved" size="sm" />
          <StatusChip status="requires_correction" size="sm" />
        </div>
      </section>

      {/* Buttons & Inputs Form Controls */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          3. Controls & Typography (Buttons & Inputs)
        </h2>
        <div className="p-4 bg-white border border-slate-200 rounded space-y-4">
          {/* Button variations */}
          <div>
            <div className="text-xs text-slate-500 mb-2 font-medium">Button Variants & Sizes</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="md" icon={<Check className="w-3.5 h-3.5" />}>
                Approve record
              </Button>
              <Button variant="secondary" size="md" icon={<Filter className="w-3.5 h-3.5" />}>
                Filter view
              </Button>
              <Button variant="ghost" size="md" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                View source
              </Button>
              <Button variant="danger" size="md" icon={<X className="w-3.5 h-3.5" />}>
                Reject proposal
              </Button>
              <Button variant="primary" size="sm">
                Primary (sm)
              </Button>
              <Button variant="secondary" size="sm">
                Secondary (sm)
              </Button>
              <Button variant="secondary" loading size="sm">
                Loading
              </Button>
              <Button variant="secondary" disabled size="sm">
                Disabled
              </Button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500 mb-2 font-medium">Input Controls</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                label="Standard text input"
                placeholder="Search patient records..."
                leftIcon={<Search className="w-3.5 h-3.5" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Input
                label="Monospace clinical ID"
                mono
                placeholder="e.g. SYN-9901"
                defaultValue="SYN-84920"
                helperText="Formatted as IBM Plex Mono"
              />
              <Input
                label="Dosage specification"
                mono
                placeholder="e.g. 5.0 mg/kg q24h"
                defaultValue="5.0 mg/kg"
              />
              <Input
                label="Validation error state"
                placeholder="ICD-10 Code"
                defaultValue="INVALID_CODE"
                error="Unknown ICD-10 diagnostic code"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Dense Clinical Table */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              4. Dense Clinical Table (Tables First)
            </h2>
            <p className="text-xs text-slate-500">
              Sticky header, 1px hairline borders, 36px row height, monospace identifiers.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2 py-1 text-xs rounded font-medium ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All records ({mockRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-2 py-1 text-xs rounded font-medium ${
                activeTab === 'pending'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Pending review (1)
            </button>
            <button
              onClick={() => setActiveTab('empty')}
              className={`px-2 py-1 text-xs rounded font-medium ${
                activeTab === 'empty'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Empty test
            </button>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <EmptyState
            title="No records matching filter criteria"
            description="No clinical records match the specified search term or status filter."
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setActiveTab('all')
                  setSearchTerm('')
                }}
              >
                Reset filters
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Record ID</TableHead>
                <TableHead>Patient MRN</TableHead>
                <TableHead>Clinical Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Verifier</TableHead>
                <TableHead>AI Confidence</TableHead>
                <TableHead alignRight>Action</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((rec) => (
                <TableRow key={rec.id}>
                  <TableCell mono className="font-semibold text-slate-900">
                    {rec.id}
                  </TableCell>
                  <TableCell mono>{rec.patientId}</TableCell>
                  <TableCell className="font-medium">{rec.type}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{rec.source}</TableCell>
                  <TableCell mono>{rec.timestamp}</TableCell>
                  <TableCell>
                    <StatusChip status={rec.status} size="sm" />
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">{rec.verifier}</TableCell>
                  <TableCell mono className="text-xs text-slate-600">
                    {rec.confidence}
                  </TableCell>
                  <TableCell alignRight>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setModalOpen(true)}
                      className="h-6 px-2 text-xs"
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

      {/* Interactive Modal Showcase */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Verify Clinical Record REC-2026-0819"
        subtitle="Patient: Eleanor Vance (MRN: SYN-84920) | Discharge Summary extraction"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                alert('Record rejected and sent back for correction.')
                setModalOpen(false)
              }}
            >
              Reject with note
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Check className="w-3.5 h-3.5" />}
              onClick={() => {
                alert('Record verified and approved. Audited to immutable trail.')
                setModalOpen(false)
              }}
            >
              Approve & Commit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Banner variant="info" compact>
            AI proposal extracted by Aria adapter. Human verifier sign-off required before writing to trusted store.
          </Banner>

          <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Extraction source</span>
              <span className="font-mono text-slate-800">discharge_summary_v2.pdf (Untrusted)</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Proposed medication</span>
              <span className="font-semibold text-slate-900">Metoprolol Tartrate 25 mg PO BID</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Indication</span>
              <span className="text-slate-800">Atrial fibrillation rate control</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Confidence score</span>
              <span className="font-mono text-teal-800 font-semibold">0.94 / 1.00</span>
            </div>
          </div>

          <Input
            label="Verifier Audit Comment (Mandatory for overrides)"
            placeholder="Document rationale for verification decision..."
          />
        </div>
      </Modal>
    </div>
  )
}
