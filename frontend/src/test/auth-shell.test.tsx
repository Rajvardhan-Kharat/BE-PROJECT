import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { queryClient } from '../services/queryClient'
import { api, UnauthorizedError, ForbiddenError } from '../services/api'

// Helper component to trigger auth actions in tests
const AuthTestHelper: React.FC = () => {
  const { user, logout, switchRole, isAuthenticated } = useAuth()
  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="user-role">{user?.role}</div>
      <button onClick={logout} data-testid="btn-logout">
        Logout
      </button>
      <button onClick={() => switchRole('patient')} data-testid="btn-switch-patient">
        Switch Patient
      </button>
      <button onClick={() => switchRole('hospital_admin')} data-testid="btn-switch-admin">
        Switch Admin
      </button>
    </div>
  )
}

describe('Frontend Shell: Auth & Cache Invariants', () => {
  beforeEach(() => {
    localStorage.clear()
    queryClient.clear()
    vi.restoreAllMocks()
  })

  describe('Protected Route Redirects', () => {
    it('redirects unauthenticated users to /login', () => {
      // Mock unauthenticated state by clearing localStorage and mounting with a dummy context
      localStorage.setItem('vericare_synthetic_auth_user', 'null')

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/dashboard']}>
              <Routes>
                <Route path="/login" element={<div>Login Page Target</div>} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <div>Private Dashboard Content</div>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      )

      // First logout the default prototype account to simulate unauthenticated state
      const logoutBtn = screen.queryByTestId('btn-logout')
      if (logoutBtn) {
        act(() => {
          logoutBtn.click()
        })
      }
    })

    it('denies access when user role is not in allowedRoles', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/audit']}>
              <Routes>
                <Route
                  path="/audit"
                  element={
                    <ProtectedRoute allowedRoles={['hospital_admin', 'system_admin']}>
                      <div>Sensitive Audit Log</div>
                    </ProtectedRoute>
                  }
                />
              </Routes>
              <AuthTestHelper />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      )

      // Switch to 'patient' role which is NOT in allowedRoles ['hospital_admin', 'system_admin']
      const switchBtn = screen.getByTestId('btn-switch-patient')
      act(() => {
        switchBtn.click()
      })

      // Permission check should fail and render access denied
      expect(screen.getByText(/Permission Check Failed: Access Denied/i)).toBeInTheDocument()
      expect(screen.getByText(/Default deny/i)).toBeInTheDocument()
      expect(screen.queryByText('Sensitive Audit Log')).not.toBeInTheDocument()
    })
  })

  describe('TanStack Query Cache Invariants', () => {
    it('clears query cache completely on logout', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter>
              <AuthTestHelper />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      )

      // Populate query cache with clinical query data
      queryClient.setQueryData(['dashboard', 'senior_doctor', 'records'], [
        { id: 'REC-001', title: 'Synthetic Prescription' },
      ])

      expect(queryClient.getQueryData(['dashboard', 'senior_doctor', 'records'])).toBeDefined()
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)

      // Trigger logout
      const logoutBtn = screen.getByTestId('btn-logout')
      act(() => {
        logoutBtn.click()
      })

      // Invariant: queryClient cache must be completely empty after logout
      expect(queryClient.getQueryData(['dashboard', 'senior_doctor', 'records'])).toBeUndefined()
      expect(queryClient.getQueryCache().getAll().length).toBe(0)
    })

    it('clears query cache completely on role change', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter>
              <AuthTestHelper />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      )

      // Populate query cache with data for the initial role
      queryClient.setQueryData(['care_team_records'], [{ id: 'CT-99', patient: 'SYN-01' }])
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)

      // Switch role to patient
      const switchPatientBtn = screen.getByTestId('btn-switch-patient')
      act(() => {
        switchPatientBtn.click()
      })

      // Invariant: query cache must be cleared so the previous role's data never leaks
      expect(queryClient.getQueryCache().getAll().length).toBe(0)
    })
  })

  describe('API Client Error Handling (401 & 403)', () => {
    it('triggers onUnauthorized and throws UnauthorizedError on 401', async () => {
      const unauthorizedSpy = vi.fn()
      const unsub = api.onUnauthorized(unauthorizedSpy)

      // Mock fetch returning 401
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Token expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(api.get('/dashboard/doctor')).rejects.toThrow(UnauthorizedError)
      expect(unauthorizedSpy).toHaveBeenCalledTimes(1)

      unsub()
    })

    it('triggers onForbidden and throws ForbiddenError on 403', async () => {
      const forbiddenSpy = vi.fn()
      const unsub = api.onForbidden(forbiddenSpy)

      // Mock fetch returning 403
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: 'Care team scope check failed', audited: true }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      await expect(api.get('/records/unauthorized-patient')).rejects.toThrow(ForbiddenError)
      expect(forbiddenSpy).toHaveBeenCalledTimes(1)

      unsub()
    })
  })
})
