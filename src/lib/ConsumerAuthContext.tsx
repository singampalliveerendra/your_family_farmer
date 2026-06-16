'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import dynamic from 'next/dynamic'

export type Consumer = { id: string; name: string | null; phone: string }

type AuthState =
  | { status: 'loading'; consumer: null }
  | { status: 'authenticated'; consumer: Consumer }
  | { status: 'anonymous'; consumer: null }

type LoginPayload = { phone: string; password: string }
type RegisterPayload = { name: string; phone: string; password: string }
type AuthResult = { ok: true } | { ok: false; error: string }

type ConsumerAuthContextValue = {
  state: AuthState
  consumer: Consumer | null
  /**
   * The moderator's reason when this account has been suspended, or null.
   * Surfaced so the header can show a highlighted suspension banner.
   */
  suspendedReason: string | null
  /** Dismiss the suspension banner (does not un-suspend the account). */
  dismissSuspension: () => void
  /**
   * Run `action` immediately when authenticated; otherwise open the auth modal
   * and run `action` after a successful login or registration.
   */
  requireAuth: (action: () => void) => void
  login: (payload: LoginPayload) => Promise<AuthResult>
  register: (payload: RegisterPayload) => Promise<AuthResult>
  logout: () => Promise<void>
  openAuth: () => void
  closeAuth: () => void
}

const STORAGE_KEY = 'yff_consumer_v2'
// Suspension reason is persisted separately so the banner survives the reload
// that follows the server clearing the session cookie on a suspended account.
const SUSPEND_KEY = 'yff_consumer_suspended'
const AUTH_EVENT = 'yff:consumer-auth-change'

const ConsumerAuthContext = createContext<ConsumerAuthContextValue | null>(null)

// Modal is loaded only when first opened, keeping the initial consumer page light
const AuthModal = dynamic(() => import('@/components/consumer/AuthModal'), { ssr: false })

function readCachedConsumer(): Consumer | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.phone) return parsed as Consumer
    return null
  } catch {
    return null
  }
}

function writeCachedConsumer(c: Consumer | null) {
  if (typeof window === 'undefined') return
  if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  else localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(AUTH_EVENT))
}

function readSuspendedReason(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(SUSPEND_KEY) || null
  } catch {
    return null
  }
}

function writeSuspendedReason(reason: string | null) {
  if (typeof window === 'undefined') return
  if (reason) localStorage.setItem(SUSPEND_KEY, reason)
  else localStorage.removeItem(SUSPEND_KEY)
}

export function ConsumerAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', consumer: null })
  const [suspendedReason, setSuspendedReason] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)

  // Hydrate from cache instantly, then revalidate against the server cookie
  useEffect(() => {
    const cached = readCachedConsumer()
    if (cached) setState({ status: 'authenticated', consumer: cached })
    // Show any previously-stored suspension reason immediately on reload.
    setSuspendedReason(readSuspendedReason())

    let cancelled = false
    fetch('/api/consumer/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        const c: Consumer | null = json?.consumer ?? null
        if (c) {
          writeCachedConsumer(c)
          writeSuspendedReason(null)
          setSuspendedReason(null)
          setState({ status: 'authenticated', consumer: c })
        } else {
          writeCachedConsumer(null)
          if (json?.suspended) {
            const reason = (json.suspendedReason as string | null)?.trim()
              || 'Your account has been suspended. Please contact support.'
            writeSuspendedReason(reason)
            setSuspendedReason(reason)
          }
          setState({ status: 'anonymous', consumer: null })
        }
      })
      .catch(() => {
        if (cancelled) return
        if (!cached) setState({ status: 'anonymous', consumer: null })
      })

    const sync = () => {
      const next = readCachedConsumer()
      setState(next
        ? { status: 'authenticated', consumer: next }
        : { status: 'anonymous', consumer: null })
    }
    window.addEventListener(AUTH_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      cancelled = true
      window.removeEventListener(AUTH_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const handleAuthSuccess = useCallback((consumer: Consumer) => {
    writeCachedConsumer(consumer)
    writeSuspendedReason(null)
    setSuspendedReason(null)
    setState({ status: 'authenticated', consumer })
    setModalOpen(false)
    const action = pendingAction.current
    pendingAction.current = null
    if (action) {
      // Run on next tick so the modal can finish closing first
      setTimeout(action, 0)
    }
  }, [])

  const login = useCallback(async ({ phone, password }: LoginPayload): Promise<AuthResult> => {
    const r = await fetch('/api/consumer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone, password }),
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok || !json?.consumer) {
      return { ok: false, error: json?.error ?? 'Login failed.' }
    }
    handleAuthSuccess(json.consumer)
    return { ok: true }
  }, [handleAuthSuccess])

  const register = useCallback(async (payload: RegisterPayload): Promise<AuthResult> => {
    const r = await fetch('/api/consumer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok || !json?.consumer) {
      return { ok: false, error: json?.error ?? 'Sign-up failed.' }
    }
    handleAuthSuccess(json.consumer)
    return { ok: true }
  }, [handleAuthSuccess])

  const logout = useCallback(async () => {
    await fetch('/api/consumer/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    writeCachedConsumer(null)
    setState({ status: 'anonymous', consumer: null })
  }, [])

  const requireAuth = useCallback((action: () => void) => {
    if (state.status === 'authenticated') {
      action()
      return
    }
    pendingAction.current = action
    setModalOpen(true)
  }, [state.status])

  const dismissSuspension = useCallback(() => {
    writeSuspendedReason(null)
    setSuspendedReason(null)
  }, [])

  const openAuth = useCallback(() => setModalOpen(true), [])
  const closeAuth = useCallback(() => {
    pendingAction.current = null
    setModalOpen(false)
  }, [])

  return (
    <ConsumerAuthContext.Provider
      value={{
        state,
        consumer: state.consumer,
        suspendedReason,
        dismissSuspension,
        requireAuth,
        login,
        register,
        logout,
        openAuth,
        closeAuth,
      }}
    >
      {children}
      {modalOpen && <AuthModal />}
    </ConsumerAuthContext.Provider>
  )
}

export function useConsumerAuth(): ConsumerAuthContextValue {
  const ctx = useContext(ConsumerAuthContext)
  if (!ctx) throw new Error('useConsumerAuth must be used inside <ConsumerAuthProvider>')
  return ctx
}
