'use client'

import { useEffect, useState } from 'react'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

type Mode = 'login' | 'register'

export default function AuthModal() {
  const { closeAuth, login, register } = useConsumerAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const phoneDigits = phone.replace(/\D/g, '').slice(-10)
  const isPhoneValid = phoneDigits.length === 10
  const isPasswordValid = password.length >= 6
  const isNameValid = mode === 'login' ? true : name.trim().length > 0
  const canSubmit = !loading && isPhoneValid && isPasswordValid && isNameValid

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    const result = mode === 'login'
      ? await login({ phone: phoneDigits, password })
      : await register({ name: name.trim(), phone: phoneDigits, password })
    setLoading(false)
    if (!result.ok) setError(result.error)
    // On success the provider closes the modal and re-runs the queued action
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={closeAuth}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-gray-900 leading-tight">
            {mode === 'login' ? 'Log in / లాగిన్' : 'Create account / ఖాతా సృష్టించండి'}
          </h2>
          <button
            type="button"
            onClick={closeAuth}
            aria-label="Close"
            className="text-gray-400 text-2xl leading-none px-2 active:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 bg-gray-100 rounded-xl p-1 text-sm font-bold">
            <button
              type="button"
              onClick={() => { setMode('login'); setError('') }}
              className={`py-2 rounded-lg transition-colors ${
                mode === 'login' ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500'
              }`}
            >
              Log in / లాగిన్
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError('') }}
              className={`py-2 rounded-lg transition-colors ${
                mode === 'register' ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500'
              }`}
            >
              Sign up / సైన్ అప్
            </button>
          </div>
        </div>

        <form className="px-5 py-4 space-y-3" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Your name / మీ పేరు
              </label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ramu"
                maxLength={80}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phone number / ఫోన్ నంబర్
            </label>
            <div className="flex items-stretch gap-2">
              <span className="flex items-center px-3 bg-gray-100 rounded-xl text-sm text-gray-600 font-semibold">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Password / పాస్‌వర్డ్
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'login' ? '' : 'At least 6 characters'}
                maxLength={128}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-16 text-base focus:border-green-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-semibold"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'register' && (
              <p className="text-[11px] text-gray-500 mt-1">
                Minimum 6 characters / కనీసం 6 అక్షరాలు
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full font-bold py-3.5 rounded-xl text-sm ${
              canSubmit ? 'bg-green-700 text-white active:bg-green-800' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {loading
              ? (mode === 'login' ? 'Logging in...' : 'Creating account...')
              : (mode === 'login' ? 'Log in / లాగిన్' : 'Create account / ఖాతా సృష్టించండి')}
          </button>

          <p className="text-[11px] text-gray-500 text-center pt-1 leading-relaxed">
            {mode === 'login'
              ? 'New here? Tap Sign up. / కొత్తవారా? సైన్ అప్ నొక్కండి.'
              : 'Already have an account? Tap Log in. / ఖాతా ఉందా? లాగిన్ నొక్కండి.'}
          </p>
        </form>
      </div>
    </div>
  )
}
