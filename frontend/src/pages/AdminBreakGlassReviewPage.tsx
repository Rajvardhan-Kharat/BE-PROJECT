import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { BreakGlassSession, BreakGlassAdminReviewRequest } from '../types/break_glass';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
} from 'lucide-react';

export const AdminBreakGlassReviewPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<BreakGlassSession | null>(null);
  const [reviewDetermination, setReviewDetermination] = useState<'justified' | 'questioned'>('justified');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: sessions = [], isLoading, error } = useQuery<BreakGlassSession[]>({
    queryKey: ['break-glass-sessions', filterStatus],
    queryFn: async () => {
      const url = filterStatus === 'all' 
        ? '/break-glass/admin/sessions' 
        : `/break-glass/admin/sessions?review_status=${filterStatus}`;
      return await api.get<BreakGlassSession[]>(url);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ sessionId, payload }: { sessionId: string; payload: BreakGlassAdminReviewRequest }) => {
      return await api.post<BreakGlassSession>(`/break-glass/admin/${sessionId}/review`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['break-glass-sessions'] });
      setSelectedSession(null);
      setReviewNotes('');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || 'Failed to submit clinical audit review.');
    },
  });

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;
    if (reviewNotes.trim().length < 5) {
      setErrorMsg('Audit review notes must be at least 5 characters long.');
      return;
    }

    reviewMutation.mutate({
      sessionId: selectedSession.session_id,
      payload: {
        review_status: reviewDetermination,
        review_notes: reviewNotes.trim(),
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'justified':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Justified
          </span>
        );
      case 'questioned':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Questioned
          </span>
        );
      case 'pending_review':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 mr-1" />
            Pending Audit
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-600" />
            Break-Glass Override Governance & Audit
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review emergency chart override events. Hospital policy mandates administrative clinical justification reviews for all unauthorized emergency accesses.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 pb-2">
        <Filter className="w-4 h-4 text-gray-500 ml-1" />
        <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider mr-2">Filter:</span>
        {[
          { id: 'all', label: 'All Sessions' },
          { id: 'pending_review', label: 'Pending Audit Review' },
          { id: 'justified', label: 'Justified' },
          { id: 'questioned', label: 'Questioned / Flagged' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterStatus(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterStatus === tab.id
                ? 'bg-teal-50 text-teal-800 border border-teal-200 font-semibold'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sessions Table */}
      <div className="bg-white border border-gray-200 shadow-xs rounded-md overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading break-glass audit logs...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">Failed to load break-glass audit sessions.</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No emergency break-glass sessions found matching the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 font-semibold text-gray-600">
                <tr>
                  <th className="px-4 py-3">Timestamp / Expiry</th>
                  <th className="px-4 py-3">Clinician ID</th>
                  <th className="px-4 py-3">Patient ID</th>
                  <th className="px-4 py-3">Reason Category</th>
                  <th className="px-4 py-3">Justification</th>
                  <th className="px-4 py-3">Audit Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sessions.map((session) => (
                  <tr key={session.session_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-gray-900 font-medium">
                        {new Date(session.created_at || session.granted_at || Date.now()).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Expires: {new Date(session.expires_at).toLocaleTimeString([], { timeStyle: 'short' })}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-gray-800 font-medium">{session.doctor_id}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-slate-800 font-medium">{session.patient_id}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800">
                        {session.reason_category}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={session.justification}>
                      <span className="text-gray-700">{session.justification}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(session.review_status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {session.review_status === 'pending_review' ? (
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setReviewNotes('');
                            setReviewDetermination('justified');
                            setErrorMsg(null);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded shadow-xs transition-colors"
                        >
                          Audit Review
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setReviewNotes(session.review_notes || '');
                            setReviewDetermination(session.review_status as 'justified' | 'questioned');
                            setErrorMsg(null);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal Dialog */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-md shadow-xl border border-gray-200 max-w-lg w-full p-6 text-xs sm:text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Administrative Review of Override
              </h2>
              <button
                onClick={() => setSelectedSession(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-3 bg-gray-50 p-3 rounded border border-gray-200">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 font-semibold">Clinician:</span>{' '}
                  <span className="font-mono text-gray-800">{selectedSession.doctor_id}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold">Patient:</span>{' '}
                  <span className="font-mono text-gray-800">{selectedSession.patient_id}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold">Time:</span>{' '}
                  <span className="text-gray-700">
                    {new Date(selectedSession.created_at || selectedSession.granted_at || Date.now()).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold">Urgency Category:</span>{' '}
                  <span className="font-medium text-gray-800">{selectedSession.reason_category}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-200 text-xs">
                <span className="text-gray-500 font-semibold block mb-1">Clinician Justification:</span>
                <p className="text-gray-800 bg-white p-2 rounded border border-gray-200 whitespace-pre-wrap">
                  {selectedSession.justification}
                </p>
              </div>
            </div>

            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Compliance Audit Determination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer text-xs transition-colors ${
                      reviewDetermination === 'justified'
                        ? 'border-green-500 bg-green-50 text-green-900 font-semibold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="determination"
                      value="justified"
                      checked={reviewDetermination === 'justified'}
                      onChange={() => setReviewDetermination('justified')}
                      className="sr-only"
                    />
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Justified (Compliant)</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer text-xs transition-colors ${
                      reviewDetermination === 'questioned'
                        ? 'border-red-500 bg-red-50 text-red-900 font-semibold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="determination"
                      value="questioned"
                      checked={reviewDetermination === 'questioned'}
                      onChange={() => setReviewDetermination('questioned')}
                      className="sr-only"
                    />
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>Questioned (Flagged)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Audit Notes / Reason for Determination <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Record formal administrative findings, policy reference, or follow-up interview status..."
                  rows={3}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                  required
                />
              </div>

              {errorMsg && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded border border-gray-300"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={reviewMutation.isPending}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded shadow-xs disabled:opacity-50"
                >
                  {reviewMutation.isPending ? 'Submitting...' : 'Save Audit Determination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
