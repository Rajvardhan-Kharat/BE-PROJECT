import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck, ArrowRight, UserCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Banner } from '../components/ui/Banner'
import { useAuth } from '../context/AuthContext'
import { SYNTHETIC_DEV_ACCOUNTS, type UserRole } from '../types/auth'

export const LoginPage: React.FC = () => {
  const { login, loginAsSyntheticAccount, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('dr.sarah@synthetic.vericare.internal')
  const [password, setPassword] = useState('synthetic-dev-password')
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const ok = await login(email, password)
      if (ok) {
        navigate(from, { replace: true })
      } else {
        setError('Authentication failed. Please verify credentials.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication')
    }
  }

  const handleSelectDevAccount = (role: UserRole) => {
    loginAsSyntheticAccount(role)
    navigate(from, { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top prototype strip */}
      <div className="h-7 w-full bg-slate-950 text-slate-200 border-b border-slate-800 px-3 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2">
          <span className="bg-amber-400 text-slate-950 px-1 py-0.2 text-2xs font-mono font-bold rounded-sm tracking-wider uppercase">
            Academic Prototype
          </span>
          <span className="font-mono text-amber-200/90 text-2xs font-medium">SYNTHETIC DATA ONLY</span>
        </div>
        <span className="text-2xs text-slate-400 font-mono">VeriCare Governance System</span>
      </div>

      {/* Main Login Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4">
          {/* Header branding */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-teal-700 text-white font-bold text-sm mb-2 shadow-sm">
              V
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              VeriCare AI Clinical Portal
            </h1>
            <p className="text-xs text-slate-500">
              Clinical governance and verification platform (Academic Prototype)
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white border border-slate-300 rounded p-5 space-y-4 shadow-sm">
            {error && (
              <Banner variant="critical" compact>
                {error}
              </Banner>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                label="Staff Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.org"
                required
              />

              <Input
                label="Password / Token"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isLoading}
                  iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Authenticate Session
                </Button>
              </div>
            </form>

            {/* Synthetic Dev Accounts Helper */}
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <UserCheck className="w-3.5 h-3.5 text-teal-700" />
                  <span>Synthetic Dev Accounts (One-Click Sign In)</span>
                </div>
                <span className="text-2xs font-mono text-slate-400">Mock Auth</span>
              </div>
              <p className="text-2xs text-slate-500 leading-normal">
                Click any pre-configured synthetic profile below to sign in directly with role and scope attached:
              </p>

              <div className="grid grid-cols-1 gap-1.5 pt-1">
                {SYNTHETIC_DEV_ACCOUNTS.map((account) => (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => handleSelectDevAccount(account.role)}
                    className="w-full flex items-center justify-between p-2 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-colors text-left group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-800 group-hover:text-teal-800">
                          {account.name}
                        </span>
                        <span className="text-2xs font-mono px-1 py-0.2 rounded bg-slate-200/70 text-slate-700">
                          {account.role}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-500 truncate mt-0.5">
                        {account.description}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-700 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Security policy notice */}
          <div className="text-center text-2xs text-slate-400 space-y-0.5">
            <div className="flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
              <span>Permission Formula: Role + Scope (Care Team) + Consent/State</span>
            </div>
            <div>Default deny; every authentication attempt and permission check is audited.</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-3 text-center text-2xs text-slate-400 border-t border-slate-200">
        VeriCare AI Academic Prototype • Strictly Synthetic Data • AI Proposes, Backend Enforces, Humans Decide
      </footer>
    </div>
  )
}
