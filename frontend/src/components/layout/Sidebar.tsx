import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileSearch,
  CheckSquare,
  ScrollText,
  Layers,
  ChevronDown,
  ShieldAlert,
  UploadCloud,
  FileCheck2,
  History,
  HeartPulse,
  Cpu,
  ShieldCheck,
  Lock,
  HeartHandshake,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useAuth } from '../../context/AuthContext'
import type { UserRole } from '../../types/auth'

export const Sidebar: React.FC = () => {
  const { user, switchRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const currentRole = user?.role || 'doctor'

  const navItems = [
    {
      id: 'dashboard',
      path: '/dashboard',
      label: 'Role Dashboard',
      icon: LayoutDashboard,
      roles: ['patient', 'doctor', 'senior_doctor', 'hospital_admin', 'system_admin'] as UserRole[],
    },
    {
      id: 'patients',
      path: '/patients',
      label: 'Patient Directory',
      icon: Users,
      roles: ['patient', 'doctor', 'senior_doctor', 'hospital_admin', 'system_admin'] as UserRole[],
    },
    {
      id: 'upload',
      path: '/upload',
      label: 'Document Upload',
      icon: UploadCloud,
      roles: ['doctor', 'senior_doctor', 'system_admin', 'hospital_admin'] as UserRole[],
    },
    {
      id: 'extraction-review',
      path: '/documents/DOC-SYN-84920-01/review',
      label: 'Extraction Review',
      icon: FileCheck2,
      roles: ['doctor', 'senior_doctor', 'system_admin'] as UserRole[],
    },
    {
      id: 'verification',
      path: '/verification',
      label: 'Verification queue',
      icon: FileSearch,
      roles: ['doctor', 'senior_doctor', 'system_admin'] as UserRole[],
    },
    {
      id: 'medication-safety',
      path: '/safety',
      label: 'Medication safety',
      icon: ShieldAlert,
      roles: ['patient', 'doctor', 'senior_doctor', 'system_admin'] as UserRole[],
    },
    {
      id: 'timeline-audit',
      path: '/timeline',
      label: 'Timeline audit',
      icon: History,
      roles: ['patient', 'doctor', 'senior_doctor', 'system_admin', 'hospital_admin'] as UserRole[],
    },
    {
      id: 'emergency-summary',
      path: '/emergency-summary',
      label: 'Emergency summary',
      icon: HeartPulse,
      roles: ['patient', 'doctor', 'senior_doctor', 'system_admin', 'hospital_admin'] as UserRole[],
    },
    {
      id: 'consent-settings',
      path: '/consent',
      label: 'Consent directives',
      icon: ShieldCheck,
      roles: ['patient', 'doctor', 'senior_doctor', 'system_admin', 'hospital_admin'] as UserRole[],
    },
    {
      id: 'access-log',
      path: '/access-log',
      label: 'Patient access log',
      icon: ScrollText,
      roles: ['patient', 'doctor', 'senior_doctor', 'system_admin', 'hospital_admin'] as UserRole[],
    },
    {
      id: 'aria-companion',
      path: '/aria',
      label: 'Aria Companion',
      icon: HeartHandshake,
      roles: ['patient'] as UserRole[],
    },
    {
      id: 'break-glass-admin',
      path: '/admin/break-glass',
      label: 'Break-glass audit',
      icon: Lock,
      roles: ['hospital_admin', 'system_admin', 'senior_doctor'] as UserRole[],
    },
    {
      id: 'agent-runs',
      path: '/agent-runs',
      label: 'Agent execution logs',
      icon: Cpu,
      roles: ['doctor', 'senior_doctor', 'system_admin', 'hospital_admin'] as UserRole[],
    },
    {
      id: 'worklist',
      path: '/worklist',
      label: 'Clinical worklist',
      icon: CheckSquare,
      roles: ['doctor', 'senior_doctor'] as UserRole[],
    },
    {
      id: 'audit',
      path: '/audit',
      label: 'Audit log',
      icon: ScrollText,
      roles: ['hospital_admin', 'system_admin', 'senior_doctor'] as UserRole[],
    },
    {
      id: 'dev-ui',
      path: '/dev/ui',
      label: 'UI primitives (/dev/ui)',
      icon: Layers,
      roles: ['patient', 'doctor', 'senior_doctor', 'hospital_admin', 'system_admin'] as UserRole[],
    },
  ]

  const roleOptions: { value: UserRole; label: string }[] = [
    { value: 'senior_doctor', label: 'Senior Doctor (Verifier)' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'patient', label: 'Patient' },
    { value: 'hospital_admin', label: 'Hospital Admin' },
    { value: 'system_admin', label: 'System Admin' },
  ]

  // Filter items visible for the active role
  const visibleNavItems = navItems.filter((item) => item.roles.includes(currentRole))

  return (
    <aside className="w-56 bg-slate-100 border-r border-slate-200 flex flex-col justify-between shrink-0 select-none">
      {/* Brand & Organization */}
      <div>
        <div className="h-11 px-3 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-teal-700 flex items-center justify-center text-white text-xs font-bold">
              V
            </div>
            <span className="font-semibold text-slate-900 text-base tracking-tight">
              VeriCare AI
            </span>
          </div>
          <span className="text-2xs font-mono px-1 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300">
            v0.1
          </span>
        </div>

        {/* Navigation list */}
        <div className="p-2 space-y-0.5">
          <div className="px-2 py-1 text-2xs font-semibold text-slate-500 uppercase tracking-wider">
            Workspace Nav
          </div>
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            const isActive =
              location.pathname === item.path ||
              (item.path === '/dashboard' && location.pathname === '/') ||
              (item.path === '/patients' && location.pathname.startsWith('/patients')) ||
              (item.id === 'extraction-review' && location.pathname.startsWith('/documents/'))
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1.5 rounded text-base transition-colors text-left',
                  isActive
                    ? 'bg-teal-700 text-white font-medium shadow-sm'
                    : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={cn(
                      'w-4 h-4 shrink-0',
                      isActive ? 'text-white' : 'text-slate-500'
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Role Switcher & Security Scope at bottom */}
      <div className="p-2 border-t border-slate-200 bg-white">
        <div className="px-1 mb-1.5 flex items-center justify-between text-2xs text-slate-500">
          <span className="font-semibold uppercase tracking-wider">Switch Role</span>
          <span className="text-2xs text-teal-700 font-mono">Scope check</span>
        </div>
        <div className="relative">
          <select
            value={currentRole}
            onChange={(e) => switchRole(e.target.value as UserRole)}
            className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded px-2.5 py-1.5 pr-6 font-medium focus:outline-none focus:border-teal-700 cursor-pointer"
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
        </div>

        <div className="mt-2 p-1.5 rounded bg-slate-50 border border-slate-200 text-2xs text-slate-600 leading-tight">
          <div className="flex items-center gap-1 font-semibold text-slate-700 mb-0.5">
            <ShieldAlert className="w-3 h-3 text-teal-700" />
            <span>Policy: Default Deny</span>
          </div>
          <div>Role: <span className="font-mono text-slate-900 font-semibold">{currentRole}</span></div>
          <div className="text-slate-500 mt-0.5">Query cache clears on role switch</div>
        </div>
      </div>
    </aside>
  )
}
