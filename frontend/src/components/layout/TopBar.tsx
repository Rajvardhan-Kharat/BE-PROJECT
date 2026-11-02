import React from 'react'
import { AlertCircle, User, ShieldCheck, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { NotificationDropdown } from './NotificationDropdown'

export interface PatientContext {
  id: string
  name: string
  mrn: string
  age: number
  gender: string
  allergies: string[]
  careTeam: string
  consentActive: boolean
}

interface TopBarProps {
  patient?: PatientContext
}

const defaultPatient: PatientContext = {
  id: "P-78291",
  name: "Eleanor Vance",
  mrn: "SYN-84920",
  age: 58,
  gender: "Female",
  allergies: ["Penicillin", "Sulfa drugs"],
  careTeam: "Internal Medicine Team B",
  consentActive: true,
}

export const TopBar: React.FC<TopBarProps> = ({ patient = defaultPatient }) => {
  const { user, logout } = useAuth()

  return (
    <header className="h-11 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 select-none">
      {/* Patient Clinical Context */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-slate-800">
          <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <User className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-base text-slate-900 tracking-tight">
            {patient.name}
          </span>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 shrink-0" />

        <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
          <div>
            <span className="text-slate-400 font-medium">MRN </span>
            <span className="font-mono text-slate-900 font-medium">{patient.mrn}</span>
          </div>

          <span className="text-slate-300">•</span>

          <div>
            <span>{patient.age}y {patient.gender.charAt(0)}</span>
          </div>

          <span className="text-slate-300">•</span>

          <div className="flex items-center gap-1">
            <span className="text-slate-400">Team:</span>
            <span className="text-slate-800 font-medium">{patient.careTeam}</span>
          </div>
        </div>

        {/* Critical Patient Allergy Flag */}
        {patient.allergies.length > 0 && (
          <div className="ml-2 hidden lg:flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-2xs font-medium">
            <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
            <span>Allergy: {patient.allergies.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Right metadata: Notifications, Consent, Active User & Sign out */}
      <div className="flex items-center gap-3 text-xs">
        <NotificationDropdown />

        <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 text-2xs font-medium">
          <ShieldCheck className="w-3 h-3 text-teal-700" />
          <span>Care Team Consent Active</span>
        </div>

        {user && (
          <>
            <div className="h-4 w-[1px] bg-slate-200 shrink-0 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-slate-700 font-medium hidden md:inline">{user.name}</span>
              <button
                onClick={logout}
                title="Sign out of VeriCare"
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 px-1.5 py-1 rounded hover:bg-slate-100 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="text-xs">Sign out</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
