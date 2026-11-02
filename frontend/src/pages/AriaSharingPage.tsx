import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Share2,
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  UserCheck,
  Clock,
  Sparkles,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import type { AriaSession, AriaSharedSummary, AriaDraftSummaryResponse } from '../types/aria'

const CARE_TEAM_OPTIONS = [
  { id: 'USR-VERIFIER-001', name: 'Dr. Sarah Lin (Internal Medicine - Verifier)', hospital: 'Metro General Hospital' },
  { id: 'USR-DOC-CARDIO-001', name: 'Dr. Marcus Vance (Cardiology)', hospital: 'Metro General Hospital' },
  { id: 'USR-DOC-NEURO-003', name: 'Dr. James Thorne (Neurology)', hospital: 'Valley Health System' },
]

export const AriaSharingPage: React.FC = () => {
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<AriaSession[]>([])
  const [selectedSessionRef, setSelectedSessionRef] = useState<string>('')
  const [selectedClinicianId, setSelectedClinicianId] = useState<string>(CARE_TEAM_OPTIONS[0].id)
  const [draftText, setDraftText] = useState<string>('')
  const [isDrafting, setIsDrafting] = useState<boolean>(false)
  const [isApproving, setIsApproving] = useState<boolean>(false)
  const [shares, setShares] = useState<AriaSharedSummary[]>([])
  const [isLoadingShares, setIsLoadingShares] = useState<boolean>(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [messageBanner, setMessageBanner] = useState<{
    variant: 'info' | 'warning' | 'critical'
    text: string
  } | null>(null)

  useEffect(() => {
    loadSessionsAndShares()
  }, [])

  const loadSessionsAndShares = async () => {
    setIsLoadingShares(true)
    try {
      const [sessList, sharesList] = await Promise.all([
        api.get<AriaSession[]>('/aria/sessions'),
        api.get<AriaSharedSummary[]>('/aria/shares'),
      ])
      setSessions(sessList)
      if (sessList.length > 0) {
        setSelectedSessionRef(sessList[0].session_ref)
      }
      setShares(sharesList)
    } catch (err: unknown) {
      console.error('Failed to load sharing data:', err)
      setMessageBanner({
        variant: 'critical',
        text: 'Failed to retrieve sessions or active clinician shares.',
      })
    } finally {
      setIsLoadingShares(false)
    }
  }

  const handleGenerateDraft = async () => {
    if (!selectedSessionRef) return
    setIsDrafting(true)
    setMessageBanner(null)
    try {
      const res = await api.get<AriaDraftSummaryResponse>(
        `/aria/sessions/${selectedSessionRef}/draft-summary`
      )
      setDraftText(res.draft_text)
      setMessageBanner({
        variant: 'info',
        text: 'Draft summary generated. Please review and edit carefully before approving.',
      })
    } catch (err: unknown) {
      console.error('Draft generation failed:', err)
      setMessageBanner({
        variant: 'critical',
        text: 'Could not generate draft summary from the companion service.',
      })
    } finally {
      setIsDrafting(false)
    }
  }

  const handleApproveShare = async () => {
    if (!selectedSessionRef || !selectedClinicianId || !draftText.trim()) return

    const selectedDoc = CARE_TEAM_OPTIONS.find((c) => c.id === selectedClinicianId)
    const docName = selectedDoc ? selectedDoc.name : selectedClinicianId

    const confirmed = window.confirm(
      `Approving creates an immutable snapshot visible only to ${docName}. You can revoke access at any time. Do you want to proceed?`
    )
    if (!confirmed) return

    setIsApproving(true)
    setMessageBanner(null)
    try {
      const newShare = await api.post<AriaSharedSummary>('/aria/shares', {
        session_ref: selectedSessionRef,
        recipient_id: selectedClinicianId,
        approved_text: draftText,
      })

      setShares((prev) => [newShare, ...prev])
      setDraftText('')
      setMessageBanner({
        variant: 'info',
        text: `Summary snapshot successfully approved and shared with ${docName}.`,
      })
    } catch (err: unknown) {
      console.error('Approval failed:', err)
      setMessageBanner({
        variant: 'critical',
        text: 'Failed to record approved summary snapshot.',
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handleRevokeShare = async (summaryId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to revoke this share? The clinician will immediately lose access to this summary.'
    )
    if (!confirmed) return

    setRevokingId(summaryId)
    try {
      await api.post(`/aria/shares/${summaryId}/revoke`)
      setShares((prev) =>
        prev.map((s) => (s.summary_id === summaryId ? { ...s, status: 'revoked' } : s))
      )
      setMessageBanner({
        variant: 'info',
        text: 'Access revoked. The clinician can no longer view this summary snapshot.',
      })
    } catch (err: unknown) {
      console.error('Revocation failed:', err)
      setMessageBanner({
        variant: 'critical',
        text: 'Failed to revoke summary access.',
      })
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/aria')}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Journal
          </Button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Share Companion Reflections with Care Team
            </h1>
            <p className="text-xs text-slate-500">
              Draft, review, and approve an immutable snapshot for your clinician. You retain full control.
            </p>
          </div>
        </div>
      </div>

      {messageBanner && (
        <Banner
          variant={messageBanner.variant}
          onDismiss={() => setMessageBanner(null)}
        >
          {messageBanner.text}
        </Banner>
      )}

      {/* Step 1 & 2: Select Recipient & Draft Summary */}
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileText className="h-5 w-5 text-teal-700" />
          <h2 className="text-sm font-semibold text-slate-900">
            Step 1: Choose Recipient Clinician & Generate Draft
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Select Care Team Clinician
            </label>
            <select
              value={selectedClinicianId}
              onChange={(e) => setSelectedClinicianId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            >
              {CARE_TEAM_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.hospital})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Select Journal Session
            </label>
            <select
              value={selectedSessionRef}
              onChange={(e) => setSelectedSessionRef(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            >
              {sessions.map((s) => (
                <option key={s.session_ref} value={s.session_ref}>
                  {s.title} ({new Date(s.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateDraft}
            disabled={isDrafting || !selectedSessionRef}
            className="flex items-center gap-1.5 text-xs"
          >
            {isDrafting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-teal-700" />
            )}
            Draft Summary for Clinician
          </Button>
        </div>
      </div>

      {/* Step 3: Full Preview & Edit */}
      {draftText && (
        <div className="rounded-md border border-teal-200 bg-teal-50/20 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-teal-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Step 2: Preview & Edit Your Summary
              </h2>
            </div>
            <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
              Not yet shared
            </span>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <p className="font-semibold">Patient Control Guarantee</p>
              <p className="mt-0.5">
                The clinician will see <strong>only what appears in the box below</strong> after you click Approve. You can edit, remove, or rephrase any sentence before submitting.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Summary Text (Editable)
            </label>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-slate-300 bg-white p-3 text-xs text-slate-800 font-sans leading-relaxed focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraftText('')}
              className="text-xs text-slate-600"
            >
              Cancel Draft
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleApproveShare}
                disabled={isApproving || !draftText.trim()}
                className="flex items-center gap-1.5 text-xs"
              >
                {isApproving ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Approve & Share Snapshot
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic text-right">
            Approving creates an immutable snapshot visible to the selected clinician. You can revoke access at any time.
          </p>
        </div>
      )}

      {/* Active Shares Section */}
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Active Clinician Shares & Consent
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {shares.length} shared snapshot{shares.length === 1 ? '' : 's'}
          </span>
        </div>

        {isLoadingShares ? (
          <div className="flex h-24 items-center justify-center text-xs text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading sharing records...
          </div>
        ) : shares.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-6 w-6 text-slate-400" />}
            title="No summaries shared yet"
            description="You have not approved any companion summaries for your clinical care team."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {shares.map((share) => {
              const doc = CARE_TEAM_OPTIONS.find((c) => c.id === share.recipient_id)
              const recipientDisplay = doc ? doc.name : share.recipient_id
              const isRevoked = share.status === 'revoked'

              return (
                <div key={share.summary_id} className="py-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {recipientDisplay}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                            isRevoked
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isRevoked ? 'REVOKED' : 'ACTIVE SHARE'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <Clock className="h-3 w-3" />
                        <span>
                          Shared on {new Date(share.created_at).toLocaleString()}
                        </span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">ID: {share.summary_id}</span>
                      </div>
                    </div>

                    {!isRevoked && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRevokeShare(share.summary_id)}
                        disabled={revokingId === share.summary_id}
                        className="text-xs text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {revokingId === share.summary_id ? 'Revoking...' : 'Revoke Access'}
                      </Button>
                    )}
                  </div>

                  <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 whitespace-pre-wrap font-sans">
                    {share.approved_text}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
