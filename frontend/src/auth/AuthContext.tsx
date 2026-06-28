import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from '../api/client'

const EMAIL_KEY = 'todo.email'

interface AuthContextValue {
  token: string | null
  email: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY))

  const apply = useCallback((nextToken: string, nextEmail: string) => {
    setToken(nextToken)
    localStorage.setItem(EMAIL_KEY, nextEmail)
    setTokenState(nextToken)
    setEmail(nextEmail)
  }, [])

  const login = useCallback(async (e: string, password: string) => {
    const res = await api.login({ email: e, password })
    apply(res.token, res.email)
  }, [apply])

  const register = useCallback(async (e: string, password: string) => {
    const res = await api.register({ email: e, password })
    apply(res.token, res.email)
  }, [apply])

  const logout = useCallback(() => {
    setToken(null)
    localStorage.removeItem(EMAIL_KEY)
    setTokenState(null)
    setEmail(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ token, email, login, register, logout }),
    [token, email, login, register, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
