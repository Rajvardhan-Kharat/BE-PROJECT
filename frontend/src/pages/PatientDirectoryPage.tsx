import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import type { PatientSummary } from '../types/patient'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import {
  Users,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Building2,
} from 'lucide-react'

export const PatientDirectoryPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [hospitalFilter, setHospitalFilter] = useState('ALL')

  const {
    data: patients = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PatientSummary[]>({
    queryKey: ['patients', searchTerm, hospitalFilter, user?.id, user?.role],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (searchTerm.trim()) {
        params.append('query', searchTerm.trim())
      }
      if (hospitalFilter !== 'ALL') {
        params.append('hospital_id', hospitalFilter)
      }
      const queryStr = params.toString() ? `?${params.toString()}` : ''
      return await api.get<PatientSummary[]>(`/patients${queryStr}`)
    },
  })

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-700" />
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              Patient Directory
            </h1>
            <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">
              {user?.role} scope
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Scoped clinical directory. Access restricted strictly by care team memberships, facility registration, or self-scope.
          </p>
        </div>
      </div>

      {/* Scope policy banner */}
      <Banner variant="info" compact>
        <div className="flex items-center justify-between w-full">
          <span>
            {user?.role === 'patient'
              ? 'Patient portal: Viewing self health record.'
              : user?.role === 'doctor' || user?.role === 'senior_doctor'
              ? `Care team scope active: Only patients belonging to ${user.scope?.careTeamName || 'your care team'} are visible.`
              : `Administrative scope active: Filtered by facility permissions.`}
          </span>
          <span className="font-mono text-2xs text-teal-800 font-medium">Uniform Enumeration Shield</span>
        </div>
      </Banner>

      {/* Controls & Filters */}
      <div className="p-3 bg-white border border-slate-200 rounded flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex-1 w-full sm:max-w-md">
          <Input
            size="sm"
            placeholder="Search by MRN or patient name..."
            leftIcon={<Search className="w-3.5 h-3.5" />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-2xs uppercase tracking-wider font-semibold text-slate-500">Facility:</span>
          </div>
          <select
            value={hospitalFilter}
            onChange={(e) => setHospitalFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-teal-700"
          >
            <option value="ALL">All Facilities</option>
            <option value="HOSP-METRO-01">Metro Health (HOSP-METRO-01)</option>
            <option value="HOSP-VALLEY-02">Valley Memorial (HOSP-VALLEY-02)</option>
          </select>

          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Filter
          </Button>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <Banner variant="critical" title="Failed to load patients">
          {error instanceof Error ? error.message : 'Unable to query patient directory.'}
        </Banner>
      )}

      {/* Data Table */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500 border border-slate-200 rounded bg-white">
          <div className="inline-block animate-spin w-4 h-4 border-2 border-teal-700 border-t-transparent rounded-full mb-2" />
          <div>Querying scoped patients from backend...</div>
        </div>
      ) : patients.length === 0 ? (
        <EmptyState
          icon={<Users className="w-4 h-4 text-slate-500" />}
          title="No patients found"
          description={
            searchTerm
              ? `No patients matching "${searchTerm}" found in your active care team scope.`
              : 'No patients are currently registered within your assigned care team or department scope.'
          }
          action={
            searchTerm ? (
              <Button size="sm" variant="secondary" onClick={() => setSearchTerm('')}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Patient MRN</TableHead>
              <TableHead>Internal ID</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Gender / DOB</TableHead>
              <TableHead>Linked Facilities</TableHead>
              <TableHead>Care Teams</TableHead>
              <TableHead>Critical Alerts</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead alignRight>Action</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {patients.map((pat) => (
              <TableRow
                key={pat.patient_id}
                clickable
                onClick={() => navigate(`/patients/${pat.patient_id}`)}
              >
                <TableCell mono className="font-semibold text-slate-900">
                  {pat.mrn}
                </TableCell>
                <TableCell mono className="text-slate-500">
                  {pat.patient_id}
                </TableCell>
                <TableCell className="font-medium text-slate-900">
                  {pat.name}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {pat.gender} • <span className="font-mono">{pat.date_of_birth}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {pat.hospital_ids.map((hospId) => (
                      <span
                        key={hospId}
                        className="inline-flex items-center gap-1 text-2xs font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        <Building2 className="w-2.5 h-2.5 text-slate-400" />
                        {hospId === 'HOSP-METRO-01' ? 'Metro' : 'Valley'}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {pat.care_team_ids.map((ctId) => (
                      <span
                        key={ctId}
                        className="text-2xs font-mono px-1 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200"
                      >
                        {ctId}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {pat.allergies.length > 0 ? (
                    <div className="inline-flex items-center gap-1 text-2xs font-medium text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                      <span className="truncate max-w-[140px]">{pat.allergies.join(', ')}</span>
                    </div>
                  ) : (
                    <span className="text-2xs text-slate-400">None documented</span>
                  )}
                </TableCell>
                <TableCell>
                  {pat.active_consent ? (
                    <span className="inline-flex items-center gap-1 text-2xs text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-700" />
                      Active
                    </span>
                  ) : (
                    <span className="text-2xs text-rose-700 font-medium bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      Revoked
                    </span>
                  )}
                </TableCell>
                <TableCell alignRight>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    iconRight={<ArrowRight className="w-3 h-3" />}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/patients/${pat.patient_id}`)
                    }}
                  >
                    Overview
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
