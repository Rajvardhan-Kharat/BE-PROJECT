import React from 'react'
import {
  CheckSquare,
  FileSearch,
  Users,
  ScrollText,
  Layers,
  ChevronDown,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '../../utils/cn'

export type UserRole =
  | 'patient'
  | 'doctor'
  | 'senior_doctor'
  | 'hospital_admin'
  | 'system_admin'

interface SidebarProps {
  currentRole: UserRole
  onRoleChange: (role: UserRole) => void
  activeNav: string
  onNavChange: (nav: string) => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  onRoleChange,
  activeNav,
  onNavChange,
}) => {
  const navItems = [
    { id: 'worklist', label: 'Worklist', icon: CheckSquare, badge: '4' },
    { id: 'verification', label: 'Verification queue', icon: FileSearch, badge: '2' },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'audit', label: 'Audit log', icon: ScrollText },
    { id: 'dev-ui', label: 'UI primitives (/dev/ui)', icon: Layers },
  ]

  const roleOptions: { value: UserRole; label: string }[] = [
    { value: 'patient', label: 'Patient' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'senior_doctor', label: 'Senior Doctor (Verifier)' },
    { value: 'hospital_admin', label: 'Hospital Admin' },
    { value: 'system_admin', label: 'System Admin' },
  ]

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
            Clinical Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavChange(item.id)}
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
                {item.badge && (
                  <span
                    className={cn(
                      'px-1.5 py-0.2 text-2xs font-mono rounded-full font-semibold',
                      isActive
                        ? 'bg-teal-900 text-teal-100'
                        : 'bg-slate-200 text-slate-700'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Role Switcher & Security Scope at bottom */}
      <div className="p-2 border-t border-slate-200 bg-white">
        <div className="px-1 mb-1.5 flex items-center justify-between text-2xs text-slate-500">
          <span className="font-semibold uppercase tracking-wider">Active Role</span>
          <span className="text-2xs text-teal-700 font-mono">Formula check</span>
        </div>
        <div className="relative">
          <select
            value={currentRole}
            onChange={(e) => onRoleChange(e.target.value as UserRole)}
            className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded px-2.5 py-1.5 pr-6 font-medium focus:outline-none focus:border-teal-700"
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
          <div className="text-slate-500 mt-0.5">Denials audited to backend</div>
        </div>
      </div>
    </aside>
  )
}
