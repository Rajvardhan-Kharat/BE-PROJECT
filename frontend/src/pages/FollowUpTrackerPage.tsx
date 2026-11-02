import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Pill,
  Calendar,
  FlaskConical,
  Scan,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import type { FollowUpItem, FollowUpStatus, FollowUpType } from '../types/followup'

export const FollowUpTrackerPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>()
  const patientId = id || 'PAT-SYN-001'
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUpItem | null>(null)
  const [actionModalOpen, setActionModalOpen] = useState<boolean>(false)
  const [actionStatus, setActionStatus] = useState<FollowUpStatus>('completed')
  const [actionReason, setActionReason] = useState<string>('')
  const [newDueDate, setNewDueDate] = useState<string>('')
  const [actionError, setActionError] = useState<string>('')

  // Query follow-ups
  const { data: followups = [], isLoading } = useQuery<FollowUpItem[]>({
    queryKey: ['followups', patientId, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (typeFilter !== 'all') params.append('type', typeFilter)
      const queryStr = params.toString() ? `?${params.toString()}` : ''
      const res = await api.get<any>(`/followups/patient/${patientId}${queryStr}`)
      return Array.isArray(res) ? res : res?.data || []
    },
  })

  // Run Agent 5 Evaluation Mutation
  const evalMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>(`/followups/patient/${patientId}/evaluate`)
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups', patientId] })
    },
  })

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: async (payload: { followUpId: string; status: FollowUpStatus; reason: string; newDueDate?: string }) => {
      const res = await api.patch<any>(`/followups/${payload.followUpId}/status`, {
        status: payload.status,
        reason: payload.reason,
        new_due_date: payload.newDueDate || undefined,
      })
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups', patientId] })
      setActionModalOpen(false)
      setSelectedFollowUp(null)
      setActionReason('')
      setNewDueDate('')
      setActionError('')
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to update follow-up status')
    },
  })

  const openActionModal = (item: FollowUpItem, targetStatus: FollowUpStatus) => {
    setSelectedFollowUp(item)
    setActionStatus(targetStatus)
    setActionReason('')
    setNewDueDate('')
    setActionError('')
    setActionModalOpen(true)
  }

  const handleActionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionReason.trim()) {
      setActionError('A clinical rationale or reason is mandatory for this status transition.')
      return
    }
    if (actionStatus === 'deferred' && !newDueDate) {
      setActionError('A new target due date is required when deferring a course.')
      return
    }
    if (!selectedFollowUp) return

    statusMutation.mutate({
      followUpId: selectedFollowUp.follow_up_id,
      status: actionStatus,
      reason: actionReason,
      newDueDate: actionStatus === 'deferred' ? newDueDate : undefined,
    })
  }

  // Summary Metrics
  const totalTracked = followups.length
  const upcomingCount = followups.filter((f) => f.status === 'upcoming').length
  const overdueCount = followups.filter((f) => f.status === 'overdue').length
  const needsReviewCount = followups.filter((f) => f.status === 'needs_review').length
  const completedCount = followups.filter((f) => f.status === 'completed').length

  const getStatusBadge = (status: FollowUpStatus) => {
    switch (status) {
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-800 border border-slate-300">
            <Clock className="w-3 h-3" />
            Upcoming
          </span>
        )
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3" />
            Overdue
          </span>
        )
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3" />
            Needs Review
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        )
      case 'deferred':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
            <History className="w-3 h-3" />
            Deferred
          </span>
        )
      default:
        return null
    }
  }

  const getTypeIcon = (type: FollowUpType) => {
    switch (type) {
      case 'medication_course':
        return <Pill className="w-3.5 h-3.5 text-teal-700" />
      case 'appointment':
        return <Calendar className="w-3.5 h-3.5 text-slate-700" />
      case 'lab_test':
        return <FlaskConical className="w-3.5 h-3.5 text-amber-700" />
      case 'imaging':
        return <Scan className="w-3.5 h-3.5 text-slate-700" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Follow-Up & Medication-Course Tracker
            </h1>
            <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 font-mono text-2xs">
              Agent 5 Deterministic
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated calendar schedule evaluation across authorized encounters and prescriptions for Patient{' '}
            <span className="font-mono text-slate-700">{patientId}</span>.
          </p>
        </div>

        <button
          onClick={() => evalMutation.mutate()}
          disabled={evalMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium shadow-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${evalMutation.isPending ? 'animate-spin' : ''}`} />
          Run Deterministic Schedule Check
        </button>
      </div>

      {/* Mandatory Clinical Guardrail Notice */}
      <div className="p-3 bg-slate-50 border-l-4 border-teal-700 rounded-r border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-slate-900">
            Clinical Safety Mandate: Adherence is Never Inferred
          </div>
          <div className="text-2xs text-slate-600 mt-0.5 leading-relaxed">
            Follow-up intervals and medication course durations are tracked purely against verified calendar dates and
            documented clinician actions. The platform explicitly refuses to calculate adherence scores or assume
            patient ingestion compliance.
          </div>
        </div>
      </div>

      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded">
          <div className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Total Tracked</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">{totalTracked}</div>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded">
          <div className="text-2xs font-medium text-slate-600 uppercase tracking-wider">Upcoming</div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">{upcomingCount}</div>
        </div>
        <div className="p-3 bg-white border border-rose-200 rounded bg-rose-50/30">
          <div className="text-2xs font-medium text-rose-600 uppercase tracking-wider">Overdue</div>
          <div className="text-xl font-bold font-mono text-rose-700 mt-1">{overdueCount}</div>
        </div>
        <div className="p-3 bg-white border border-amber-200 rounded bg-amber-50/30">
          <div className="text-2xs font-medium text-amber-600 uppercase tracking-wider">Needs Review</div>
          <div className="text-xl font-bold font-mono text-amber-700 mt-1">{needsReviewCount}</div>
        </div>
        <div className="p-3 bg-white border border-emerald-200 rounded bg-emerald-50/30">
          <div className="text-2xs font-medium text-emerald-600 uppercase tracking-wider">Completed</div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">{completedCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded border border-slate-200 text-xs">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {['all', 'upcoming', 'overdue', 'needs_review', 'completed', 'deferred'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-2xs font-medium capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-1.5 text-slate-500">
          <span>Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-7 px-2 bg-slate-50 border border-slate-200 rounded text-slate-800 text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
          >
            <option value="all">All Types</option>
            <option value="appointment">Appointments</option>
            <option value="medication_course">Medication Courses</option>
            <option value="lab_test">Lab Tests</option>
            <option value="imaging">Imaging</option>
          </select>
        </div>
      </div>

      {/* Table of Tracked Items */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 text-2xs font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3">Type & Course Title</th>
              <th className="py-2.5 px-3">Clinical Schedule / Details</th>
              <th className="py-2.5 px-3">Target Due Date</th>
              <th className="py-2.5 px-3">Schedule Status</th>
              <th className="py-2.5 px-3 text-right">Clinician Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  Loading deterministic schedule items...
                </td>
              </tr>
            ) : followups.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No follow-ups or medication courses found matching the selected filters.
                </td>
              </tr>
            ) : (
              followups.map((item) => {
                const isCompleted = item.status === 'completed'
                const isDeferred = item.status === 'deferred'

                return (
                  <tr key={item.follow_up_id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Title & Type */}
                    <td className="py-3 px-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 p-1 rounded bg-slate-100 border border-slate-200 shrink-0">
                          {getTypeIcon(item.type)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{item.title}</div>
                          {item.description && (
                            <div className="text-2xs text-slate-500 mt-0.5 line-clamp-1">{item.description}</div>
                          )}
                          <div className="text-3xs font-mono text-slate-400 mt-0.5">{item.follow_up_id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Medication / Schedule Details */}
                    <td className="py-3 px-3">
                      {item.medication_details ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-slate-800 text-2xs font-medium">
                            {item.medication_details.medication_name} ({item.medication_details.dosage})
                          </div>
                          <div className="text-2xs text-slate-500">
                            Course: {item.medication_details.prescribed_days} days (
                            {item.medication_details.start_date} to {item.medication_details.expected_end_date})
                          </div>
                        </div>
                      ) : (
                        <div className="text-2xs text-slate-500">
                          {item.scheduled_date ? `Scheduled: ${item.scheduled_date}` : 'Awaiting appointment booking'}
                        </div>
                      )}
                    </td>

                    {/* Due Date & Delta */}
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-slate-800">{item.due_date}</div>
                      <div className="text-3xs mt-0.5">
                        {isCompleted ? (
                          <span className="text-emerald-700">Completed on {item.completed_date || 'schedule'}</span>
                        ) : isDeferred ? (
                          <span className="text-slate-500">Rescheduled</span>
                        ) : item.days_overdue_or_remaining < 0 ? (
                          <span className="text-rose-700 font-semibold">
                            Overdue by {Math.abs(item.days_overdue_or_remaining)} day(s)
                          </span>
                        ) : item.days_overdue_or_remaining === 0 ? (
                          <span className="text-amber-700 font-semibold">Due today</span>
                        ) : (
                          <span className="text-slate-500 font-medium">
                            Due in {item.days_overdue_or_remaining} day(s)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Chip */}
                    <td className="py-3 px-3">{getStatusBadge(item.status)}</td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      {!isCompleted && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            data-testid={`action-complete-${item.follow_up_id}`}
                            onClick={() => openActionModal(item, 'completed')}
                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-2xs font-medium transition-colors"
                            title="Mark completed with documented clinical note"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => openActionModal(item, 'deferred')}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-2xs font-medium transition-colors"
                            title="Defer to a future date with clinical reason"
                          >
                            Defer
                          </button>
                          <button
                            onClick={() => openActionModal(item, 'needs_review')}
                            className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-2xs font-medium transition-colors"
                            title="Flag for care-team review"
                          >
                            Review
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Action / Status Transition Modal */}
      {actionModalOpen && selectedFollowUp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-200 shadow-xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900">
                Update Schedule Status:{' '}
                <span className="capitalize text-teal-800">{actionStatus.replace('_', ' ')}</span>
              </div>
              <button
                onClick={() => setActionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleActionSubmit} className="p-4 space-y-3">
              <div>
                <span className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">Course / Event</span>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">{selectedFollowUp.title}</div>
                <div className="text-3xs font-mono text-slate-400">{selectedFollowUp.follow_up_id}</div>
              </div>

              {actionStatus === 'deferred' && (
                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    New Target Due Date (Required) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                  />
                </div>
              )}

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">
                  Clinical Rationale / Decision Note <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Mandatory clinical explanation for this status change (e.g. Inpatient consult confirmed completed, patient deferred due to travel)..."
                  className="w-full p-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden resize-none"
                />
              </div>

              {actionError && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded text-2xs text-rose-800">
                  {actionError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActionModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusMutation.isPending}
                  className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium shadow-xs disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Saving...' : 'Confirm Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
