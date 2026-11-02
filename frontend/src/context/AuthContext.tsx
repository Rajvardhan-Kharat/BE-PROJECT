import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User, UserRole } from '../types/auth'
import { SYNTHETIC_DEV_ACCOUNTS } from '../types/auth'
import { api, ForbiddenError } from '../services/api'
import { resetQueryClientCache } from '../services/queryClient'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password?: string) => Promise<boolean>
  loginAsSyntheticAccount: (role: UserRole) => void
  logout: () => void
  switchRole: (role: UserRole) => void
  lastDeniedError: string | null
  clearDeniedError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'vericare_synthetic_auth_user'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as User
        api.setToken(parsed.token)
        return parsed
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    // Default to the first dev account (Senior Doctor verifier) in prototype mode if nothing in storage
    const initialAccount = SYNTHETIC_DEV_ACCOUNTS[0]
    const defaultUser: User = {
      id: `USR-${initialAccount.role.toUpperCase()}-001`,
      name: initialAccount.name,
      email: initialAccount.email,
      role: initialAccount.role,
      scope: initialAccount.scope,
      consentActive: true,
      token: `mock-jwt-token-for-${initialAccount.role}`,
    }
    api.setToken(defaultUser.token)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUser))
    } catch {
      // Ignore storage errors in test or restricted environments
    }
    return defaultUser
  })

  const [isLoading, setIsLoading] = useState(false)
  const [lastDeniedError, setLastDeniedError] = useState<string | null>(null)

  const clearDeniedError = useCallback(() => {
    setLastDeniedError(null)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    api.setToken(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
    // Strict requirement: query client cache MUST be cleared on logout
    resetQueryClientCache()
  }, [])

  // Hook into API client 401 & 403 events
  useEffect(() => {
    const unsub401 = api.onUnauthorized(() => {
      logout()
    })

    const unsub403 = api.onForbidden((err: ForbiddenError) => {
      setLastDeniedError(err.message)
    })

    return () => {
      unsub401()
      unsub403()
    }
  }, [logout])

  const loginAsSyntheticAccount = useCallback((role: UserRole) => {
    const account = SYNTHETIC_DEV_ACCOUNTS.find((a) => a.role === role) || SYNTHETIC_DEV_ACCOUNTS[0]
    const newUser: User = {
      id: `USR-${account.role.toUpperCase()}-001`,
      name: account.name,
      email: account.email,
      role: account.role,
      scope: account.scope,
      consentActive: true,
      token: `mock-jwt-token-for-${account.role}`,
    }
    setUser(newUser)
    api.setToken(newUser.token)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser))
    } catch {
      // Ignore
    }
    // Strict requirement: cache cleared on role change
    resetQueryClientCache()
    setLastDeniedError(null)

    // In background, upgrade to official signed JWT token if backend is reachable
    api
      .post<{ access_token: string }>('/auth/login', {
        email: account.email,
        password: 'synthetic-dev-password',
      })
      .then((res) => {
        if (res && res.access_token) {
          api.setToken(res.access_token)
          const upgradedUser = { ...newUser, token: res.access_token }
          setUser(upgradedUser)
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(upgradedUser))
          } catch {
            // Ignore
          }
        }
      })
      .catch(() => {
        // Fallback to dev token is already active and handled by rbac
      })
  }, [])

  const switchRole = useCallback((newRole: UserRole) => {
    loginAsSyntheticAccount(newRole)
  }, [loginAsSyntheticAccount])

  const login = useCallback(
    async (email: string, _password?: string): Promise<boolean> => {
      setIsLoading(true)
      try {
        // Find if it matches one of our synthetic accounts
        const matched = SYNTHETIC_DEV_ACCOUNTS.find(
          (a) => a.email.toLowerCase() === email.toLowerCase()
        )

        const targetRole = matched ? matched.role : 'doctor'
        loginAsSyntheticAccount(targetRole)
        return true
      } finally {
        setIsLoading(false)
      }
    },
    [loginAsSyntheticAccount]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginAsSyntheticAccount,
        logout,
        switchRole,
        lastDeniedError,
        clearDeniedError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
