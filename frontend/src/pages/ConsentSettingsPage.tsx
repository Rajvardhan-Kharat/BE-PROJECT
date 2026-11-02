import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileKey,
  ShieldCheck,
  ShieldX,
  Plus,
  RefreshCw,
  Bell,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { StatusChip } from '../components/ui/StatusChip'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import { GrantConsentModal } from '../components/consent/GrantConsentModal'
import { RevokeConsentModal } from '../components/consent/RevokeConsentModal'
import type { PatientConsentResponse } from '../types/consent'
import type { PatientNotificationResponse } from '../types/access_log'

export const ConsentSettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Default to user's patient ID or PAT-SYN-001
  const patientId = id || user?.scope?.patientId || 'PAT-SYN-001'

  const [isGrantOpen, setIsGrantOpen] = useState(false)
  const [selectedConsentToRevoke, setSelectedConsentToRevoke] = useState<PatientConsentResponse | null>(null)
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'info' | 'warning'; message: string } | null>(null)

  // Query consent directives
  const {
    data: consents = [],
    isLoading: isConsentsLoading,
    refetch: refetchConsents,
  } = useQuery<PatientConsentResponse[]>({
    queryKey: ['patient_consents', patientId],
    queryFn: async () => {
      return await api.get<PatientConsentResponse[]>(`/patients/${patientId}/consents`)
    },
  })

  // Query in-app notifications
  const {
    data: notifications = [],
    isLoading: isNotifsLoading,
    refetch: refetchNotifs,
  } = useQuery<PatientNotificationResponse[]>({
    queryKey: ['patient_notifications', patientId],
    queryFn: async () => {
      return await api.get<PatientNotificationResponse[]>(`/patients/${patientId}/notifications`)
    },
  })

  // Grant mutation
  const grantMutation = useMutation({
    mutationFn: async (payload: {
      recipient: string
      purpose: string
      categories: string[]
      textVersion: string
    }) => {
      return await api.post<PatientConsentResponse>(`/patients/${patientId}/consent`, {
        patient_id: patientId,
        purpose: payload.purpose,
        categories: payload.categories,
        recipient: payload.recipient,
        text_version: payload.textVersion,
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient_consents', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patient_notifications', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patient_overview', patientId] })
      setNotificationMsg({
        type: 'info',
        message: `Clinical consent directive successfully granted for recipient '${data.recipient}'.`,
      })
    },
  })

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: async ({ consentId, reason }: { consentId: string; reason: string }) => {
      return await api.post<PatientConsentResponse>(
        `/patients/${patientId}/consent/${consentId}/revoke`,
        { reason }
      )
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient_consents', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patient_notifications', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patient_overview', patientId] })
      setNotificationMsg({
        type: 'warning',
        message: `Consent directive revoked for recipient '${data.recipient}'. Sharing is immediately blocked in backend.`,
      })
    },
  })

  // Mark notification read
  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      return await api.post(`/patients/${patientId}/notifications/${notifId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient_notifications', patientId] })
    },
  })

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Banner and Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <FileKey className="w-5 h-5 text-teal-800" />
            <h1 className="text-lg font-bold text-slate-900">Consent Directives & Privacy Controls</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Granular clinical data sharing policies for Patient{' '}
            <span className="font-mono text-slate-800 font-semibold">{patientId}</span>. Backend-enforced on every read.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsGrantOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Grant Directive
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              refetchConsents()
              refetchNotifs()
            }}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {notificationMsg && (
        <Banner
          variant={notificationMsg.type}
          onDismiss={() => setNotificationMsg(null)}
        >
          {notificationMsg.message}
        </Banner>
      )}

      {/* Main Grid: Directives List & In-App Notifications Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Directives List (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded overflow-hidden shadow-xs space-y-0">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <h2 className="text-xs font-semibold text-slate-900">Active & Revoked Consent Directives</h2>
              <span className="text-2xs font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                {consents.length} directives
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Revocation immediately blocks recipient access
            </span>
          </div>

          {isConsentsLoading ? (
            <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
              Loading consent directives...
            </div>
          ) : consents.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<FileKey className="w-5 h-5 text-slate-400" />}
                title="No custom consent directives"
                description="Default care-team treatment consent is currently active for this patient."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {consents.map((consent) => (
                <div key={consent.consent_id} className="p-4 hover:bg-slate-50/50 transition-colors text-xs space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{consent.recipient}</span>
                      <StatusChip
                        status={consent.status === 'granted' ? 'approved' : 'rejected'}
                        label={consent.status.toUpperCase()}
                      />
                      <span className="text-2xs font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 uppercase">
                        {consent.purpose}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {consent.status === 'granted' && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setSelectedConsentToRevoke(consent)}
                          icon={<ShieldX className="w-3.5 h-3.5" />}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                    <span className="text-slate-500 font-medium">Covered Categories:</span>
                    {consent.categories.map((cat) => (
                      <span
                        key={cat}
                        className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[10px]"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-2xs text-slate-400 font-mono pt-1">
                    <span>ID: {consent.consent_id}</span>
                    <span>•</span>
                    <span>Version: {consent.text_version}</span>
                    <span>•</span>
                    <span>Effective: {new Date(consent.effective_from).toLocaleDateString()}</span>
                    {consent.revoked_at && (
                      <>
                        <span>•</span>
                        <span className="text-rose-600">
                          Revoked: {new Date(consent.revoked_at).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>

                  {consent.revocation_reason && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-900">
                      <strong>Revocation Reason: </strong>
                      {consent.revocation_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: In-App Patient Notifications Feed (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded overflow-hidden shadow-xs space-y-0">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-700" />
              <h2 className="text-xs font-semibold text-slate-900">Patient Alerts Feed</h2>
              <span className="text-2xs font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                {notifications.filter((n) => !n.read).length} new
              </span>
            </div>
          </div>

          {isNotifsLoading ? (
            <div className="p-6 text-center text-xs text-slate-400 animate-pulse">
              Loading alerts...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Bell className="w-5 h-5 text-slate-300" />}
                title="No notifications"
                description="No break-glass emergency alerts or consent changes recorded."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {notifications.map((notif) => (
                <div
                  key={notif.notification_id}
                  className={`p-3 text-xs space-y-1 transition-colors ${
                    notif.read ? 'bg-white' : 'bg-amber-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-[11px] flex items-center gap-1.5">
                      {notif.type === 'BREAK_GLASS_ACCESS' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      ) : (
                        <FileKey className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      )}
                      {notif.title}
                    </span>
                    {!notif.read && (
                      <button
                        onClick={() => markReadMutation.mutate(notif.notification_id)}
                        className="text-[10px] text-teal-700 hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    {notif.message}
                  </p>

                  <div className="text-[10px] text-slate-400 font-mono">
                    {new Date(notif.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grant Modal */}
      <GrantConsentModal
        isOpen={isGrantOpen}
        onClose={() => setIsGrantOpen(false)}
        patientId={patientId}
        onSubmit={async (params) => {
          await grantMutation.mutateAsync(params)
        }}
        isLoading={grantMutation.isPending}
      />

      {/* Revoke Modal */}
      <RevokeConsentModal
        isOpen={Boolean(selectedConsentToRevoke)}
        onClose={() => setSelectedConsentToRevoke(null)}
        consent={selectedConsentToRevoke}
        onRevoke={async (consentId, reason) => {
          await revokeMutation.mutateAsync({ consentId, reason })
        }}
        isLoading={revokeMutation.isPending}
      />
    </div>
  )
}
