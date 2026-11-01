import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { EmptyState } from '../components/ui/EmptyState'
import { Banner } from '../components/ui/Banner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import { StatusChip, type RecordStatus } from '../components/ui/StatusChip'
import {
  ShieldCheck,
  FileSearch,
  CheckSquare,
  Users,
  ScrollText,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { Button } from '../components/ui/Button'

interface RecordItem {
  id: string
  title: string
  status: RecordStatus
  source: string
  createdAt: string
  verifier?: string
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth()
  const role = user?.role || 'doctor'

  // Fetch real API data scoped to current role
  const {
    data: records,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<RecordItem[]>({
    queryKey: ['dashboard', role, user?.id],
    queryFn: async () => {
      // In this shell stage, the backend endpoint may return [] or 404/network error until backend services run
      try {
        const res = await api.get<RecordItem[]>(`/dashboard/${role}`)
        return Array.isArray(res) ? res : []
      } catch (err: unknown) {
        // If endpoint does not exist yet (backend not started), return empty array so we show real empty state
        // rather than fabricating mock data
        console.info(`API route /dashboard/${role} not yet returning data:`, err)
        return []
      }
    },
  })

  // Role descriptions
  const roleTitles: Record<string, { title: string; subtitle: string; icon: React.ReactNode }> = {
    patient: {
      title: 'Patient Health Portal',
      subtitle: `Viewing synthetic record for Patient MRN: ${user?.scope?.patientId || 'SYN-84920'}`,
      icon: <Users className="w-4 h-4 text-teal-700" />,
    },
    doctor: {
      title: 'Physician Clinical Workspace',
      subtitle: `Scope: ${user?.scope?.careTeamName || 'Internal Medicine Team B'}`,
      icon: <CheckSquare className="w-4 h-4 text-teal-700" />,
    },
    senior_doctor: {
      title: 'Senior Clinical Verifier Queue',
      subtitle: 'Authority to verify, approve, or reject untrusted AI extractions and proposals',
      icon: <FileSearch className="w-4 h-4 text-teal-700" />,
    },
    hospital_admin: {
      title: 'Hospital Administration & Governance',
      subtitle: `Hospital Facility: ${user?.scope?.hospitalId || 'HOSP-METRO-01'}`,
      icon: <ScrollText className="w-4 h-4 text-teal-700" />,
    },
    system_admin: {
      title: 'Platform System Administration',
      subtitle: 'System security, external Aria adapter health, and permission enforcement auditing',
      icon: <Activity className="w-4 h-4 text-teal-700" />,
    },
  }

  const roleMeta = roleTitles[role] || roleTitles.doctor

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            {roleMeta.icon}
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              {roleMeta.title}
            </h1>
            <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">
              {role}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{roleMeta.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refetch()}
            loading={isFetching}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh data
          </Button>
        </div>
      </div>

      {/* Scope banner */}
      <Banner variant="info" compact>
        <div className="flex items-center justify-between w-full">
          <span>
            Active permission formula: <span className="font-mono font-semibold">{role}</span> +{' '}
            <span className="font-mono">{user?.scope?.careTeamName || user?.scope?.hospitalId || 'Direct scope'}</span>{' '}
            + <span className="font-mono">Consent active</span>.
          </span>
          <span className="font-mono text-2xs text-teal-800 hidden md:inline">Default Deny</span>
        </div>
      </Banner>

      {/* Error display if API fails unexpectedly */}
      {isError && (
        <Banner variant="critical" title="API Communication Failure">
          {error instanceof Error ? error.message : 'Unable to retrieve clinical data from server.'}
        </Banner>
      )}

      {/* Main Real Data Area - STRICTLY NO PLACEHOLDER STATS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Live Clinical Records ({records?.length || 0})
          </h2>
          <span className="text-2xs text-slate-400">
            Source: Motor MongoDB Trusted/Untrusted Collections
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-slate-200 rounded bg-white">
            <div className="inline-block animate-spin w-4 h-4 border-2 border-teal-700 border-t-transparent rounded-full mb-2" />
            <div>Querying live backend records...</div>
          </div>
        ) : !records || records.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="w-4 h-4 text-slate-500" />}
            title={`No ${role.replace('_', ' ')} records found`}
            description={
              role === 'senior_doctor'
                ? 'No untrusted AI proposals are currently awaiting human verifier sign-off.'
                : role === 'patient'
                ? 'No synthetic health records have been authorized for this patient ID.'
                : role === 'doctor'
                ? 'No active draft notes or patients awaiting clinical documentation in your care team.'
                : 'No active records or audit events exist for this administrative scope.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => refetch()}>
                Check again
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Record ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
                {role === 'senior_doctor' && <TableHead>Assigned Verifier</TableHead>}
              </tr>
            </TableHeader>
            <TableBody>
              {records.map((item) => (
                <TableRow key={item.id}>
                  <TableCell mono className="font-semibold text-slate-900">
                    {item.id}
                  </TableCell>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell className="text-xs text-slate-600">{item.source}</TableCell>
                  <TableCell mono>{item.createdAt}</TableCell>
                  <TableCell>
                    <StatusChip status={item.status} size="sm" />
                  </TableCell>
                  {role === 'senior_doctor' && (
                    <TableCell className="text-xs text-slate-700">
                      {item.verifier || 'Unassigned'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
