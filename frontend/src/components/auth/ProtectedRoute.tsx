import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { UserRole } from '../../types/auth'
import { ShieldAlert } from 'lucide-react'
import { Button } from '../ui/Button'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-xs font-mono">
        Loading session...
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-white border border-rose-300 rounded shadow-sm text-left space-y-3">
        <div className="flex items-center gap-2 text-rose-700 font-semibold text-base">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Permission Check Failed: Access Denied</span>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed">
          Your current role (<span className="font-mono font-semibold">{user.role}</span>) does not have authorization to access this view.
          Under VeriCare governance, access is evaluated as:
        </p>
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded font-mono text-2xs text-slate-800 space-y-1">
          <div>Role: <span className="font-semibold text-rose-700">{user.role}</span> (Required: {allowedRoles.join(', ')})</div>
          <div>Scope: {user.scope?.careTeamName || user.scope?.hospitalId || 'General scope'}</div>
          <div>Consent / State: {user.consentActive ? 'Active' : 'Revoked'}</div>
        </div>
        <p className="text-2xs text-slate-500">
          Security policy: Default deny. This denial has been logged for audit review.
        </p>
        <div className="pt-2">
          <Button size="sm" variant="secondary" onClick={() => window.history.back()}>
            Return to previous view
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
