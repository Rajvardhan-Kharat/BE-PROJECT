import React, { useState } from 'react'
import { PrototypeStrip } from './components/layout/PrototypeStrip'
import { TopBar } from './components/layout/TopBar'
import { Sidebar, type UserRole } from './components/layout/Sidebar'
import { DevUiPage } from './pages/DevUiPage'
import { EmptyState } from './components/ui/EmptyState'
import { Clock, ShieldAlert } from 'lucide-react'

export const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('senior_doctor')
  const [activeNav, setActiveNav] = useState<string>('dev-ui')

  // Simple client routing based on activeNav
  const renderContent = () => {
    switch (activeNav) {
      case 'dev-ui':
        return <DevUiPage />
      case 'worklist':
        return (
          <div className="p-6">
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Worklist</h1>
            <p className="text-xs text-slate-500 mb-6">
              Clinical tasks assigned to your active role (<span className="font-mono text-slate-700">{role}</span>).
            </p>
            <EmptyState
              icon={<Clock className="w-4 h-4 text-slate-500" />}
              title="Worklist synchronization in progress"
              description="Switch to UI Primitives (/dev/ui) in the sidebar to review all clinical components and tokens."
            />
          </div>
        )
      case 'verification':
        return (
          <div className="p-6">
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Verification Queue</h1>
            <p className="text-xs text-slate-500 mb-6">
              Untrusted AI proposals awaiting human verifier sign-off.
            </p>
            <EmptyState
              icon={<ShieldAlert className="w-4 h-4 text-slate-500" />}
              title="Verification queue in progress"
              description="Review the full component specification on the UI primitives page."
            />
          </div>
        )
      default:
        return <DevUiPage />
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* 1. Persistent Synthetic Prototype Banner */}
      <PrototypeStrip />

      {/* 2. Top Bar with Patient Clinical Context */}
      <TopBar />

      {/* 3. Main Split View: Left Sidebar + Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentRole={role}
          onRoleChange={setRole}
          activeNav={activeNav}
          onNavChange={setActiveNav}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

export default App
