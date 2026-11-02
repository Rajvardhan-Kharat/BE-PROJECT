import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileSearch,
  Filter,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Building2,
  History,
} from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { StatusChip } from '../components/ui/StatusChip'
import { EmptyState } from '../components/ui/EmptyState'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import { RecordHistoryModal } from '../components/verification/RecordHistoryModal'
import type { VerificationQueueItem } from '../types/verification'

export const VerificationQueuePage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedRecordForHistory, setSelectedRecordForHistory] = useState<string | null>(null)

  // Query verification queue from backend
  const {
    data: queue = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<VerificationQueueItem[]>({
    queryKey: ['verification_queue', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter)
      }
      return await api.get<VerificationQueueItem[]>(
        `/verification/queue?${params.toString()}`
      )
    },
  })

  const isSeniorDoctor = user?.role === 'senior_doctor' || user?.role === 'system_admin'

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-teal-700" />
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              Clinical Verification Queue
            </h1>
            <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
              Pending Human Sign-off
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review untrusted clinical extracts and external AI proposals. Approved records commit to the trusted clinical timeline; rejected and modified records preserve audit provenance.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            loading={isRefetching}
            onClick={() => refetch()}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh queue
          </Button>
        </div>
      </div>

      {/* Verifier Role Notice Banner */}
      {!isSeniorDoctor && (
        <Banner variant="warning" compact>
          <div className="text-2xs text-amber-900">
            <span className="font-semibold">View-only role scope:</span> You are currently signed in as{' '}
            <span className="font-mono font-medium">{user?.role}</span>. Only Senior Doctor Verifiers hold clinical authority to approve or reject records in this queue.
          </div>
        </Banner>
      )}

      {/* Filter and Metrics Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-700">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-teal-700 font-medium"
          >
            <option value="ALL">All Awaiting Review ({queue.length})</option>
            <option value="pending_review">Pending Review Only</option>
            <option value="requires_correction">Requires Correction Only</option>
          </select>
        </div>

        <div className="flex items-center gap-4 text-2xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>
              Pending:{' '}
              <span className="font-semibold text-slate-900">
                {queue.filter((q) => q.status === 'pending_review').length}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>
              Requires Correction:{' '}
              <span className="font-semibold text-slate-900">
                {queue.filter((q) => q.status === 'requires_correction').length}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Queue Table */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded">
          <div className="w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading verification worklist...
        </div>
      ) : queue.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          title="Verification queue is all caught up"
          description="There are no proposals or OCR extracts currently awaiting clinician verifier review."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient / Context</TableHead>
                <TableHead>Clinical Proposal</TableHead>
                <TableHead>Specialty & Facility</TableHead>
                <TableHead>Author / Submitter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => {
                const isSelf = item.submitted_by === user?.id
                return (
                  <TableRow key={item.version_id} data-testid={`queue-row-${item.version_id}`}>
                    {/* Patient Context */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 text-xs">
                          {item.patient_name}
                        </div>
                        <div className="text-2xs font-mono text-slate-500">
                          MRN: {item.mrn} • {item.patient_id}
                        </div>
                      </div>
                    </TableCell>

                    {/* Proposal Details */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium text-slate-800 text-xs">
                          {item.title}
                        </div>
                        <div className="text-2xs text-slate-500 flex items-center gap-1.5">
                          <span className="font-mono font-medium text-teal-800">
                            v{item.version_number}
                          </span>
                          <span>•</span>
                          <span className="capitalize">{item.record_type.replace(/_/g, ' ')}</span>
                          {item.has_prior_approved && (
                            <span className="text-2xs px-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Update to Approved
                            </span>
                          )}
                        </div>
                        {item.review_reason && (
                          <div className="text-2xs text-rose-700 italic mt-0.5 line-clamp-1">
                            Note: {item.review_reason}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Specialty & Facility */}
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div className="font-medium text-slate-700">{item.department}</div>
                        <div className="text-2xs text-slate-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[160px]">
                            {item.hospital_name || item.hospital_id}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Submitter */}
                    <TableCell>
                      <div className="space-y-0.5 text-2xs text-slate-600">
                        <div className="font-medium text-slate-800">
                          {item.submitter_name || item.submitted_by || 'System Ingestion'}
                          {isSelf && (
                            <span className="ml-1 px-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                              You
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-slate-400">
                          {new Date(item.submitted_at).toLocaleDateString()}
                        </div>
                      </div>
                    </TableCell>

                    {/* Status Chip */}
                    <TableCell>
                      <StatusChip status={item.status} size="sm" />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="View Version History"
                          onClick={() => setSelectedRecordForHistory(item.record_id)}
                          className="h-7 px-1.5 text-slate-500"
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => navigate(`/verification/${item.version_id}/compare`)}
                          icon={<ArrowRight className="w-3.5 h-3.5" />}
                          className="h-7 text-xs"
                        >
                          Review & Compare
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Version History Modal */}
      <RecordHistoryModal
        isOpen={!!selectedRecordForHistory}
        onClose={() => setSelectedRecordForHistory(null)}
        recordId={selectedRecordForHistory}
      />
    </div>
  )
}
