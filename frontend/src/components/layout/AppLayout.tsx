import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { PrototypeStrip } from './PrototypeStrip'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { Banner } from '../ui/Banner'
import { useAuth } from '../../context/AuthContext'

export const AppLayout: React.FC = () => {
  const { lastDeniedError, clearDeniedError } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* 1. Persistent Synthetic Prototype Banner */}
      <PrototypeStrip />

      {/* 2. Top Bar with Patient Clinical Context and User Auth */}
      <TopBar onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)} />

      {/* 3. Main Workspace Layout: Sidebar + Main Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-6">
          {/* Permission denial alert banner if 403 was received */}
          {lastDeniedError && (
            <div className="mb-4">
              <Banner
                variant="critical"
                title="Access Denied (403 Audited)"
                onDismiss={clearDeniedError}
              >
                {lastDeniedError}
              </Banner>
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  )
}
