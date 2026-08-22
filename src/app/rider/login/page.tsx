'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ForgotPasswordModal from '@/components/ForgotPasswordModal'
import { useLang } from '@/lib/LanguageContext'

export default function RiderLoginPage() {
  const { L } = useLang()
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    const r = await fetch('/api/rider/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone, password }),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError(L('Network error.', 'నెట్‌వర్క్ లోపం.')); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) { setError(json?.error ?? 'Login failed.'); return }
    router.replace('/rider/dashboard')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-green-900 px-4 pt-8 pb-12">
        <h1 className="text-white text-2xl font-extrabold">{L('Delivery partner login', 'డెలివరీ పార్ట్నర్ లాగిన్')}</h1>
      </div>

      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-md mx-4 -mt-6 p-5 space-y-4 max-w-md w-full mx-auto"
      >
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            {L('Phone number', 'ఫోన్ నంబర్')}
          </label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              maxLength={10}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              required
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            {L('Password', 'పాస్‌వర్డ్')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
            required
          />
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base active:bg-green-800 disabled:opacity-50"
        >
          {submitting ? 'Logging in...' : L('Log in', 'లాగిన్')}
        </button>

        <button
          type="button"
          onClick={() => setShowForgot(true)}
          className="w-full text-center text-sm text-green-700 font-semibold underline"
        >
          {L('Forgot Password?', 'పాస్‌వర్డ్ మర్చిపోయారా?')}
        </button>

        <div className="text-xs text-gray-600 text-center pt-2">
          <p>
            New here?{' '}
            <Link href="/rider/signup" className="text-green-700 font-bold underline">
              {L('Sign up to deliver', 'డెలివరీ కోసం నమోదు')}
            </Link>
          </p>
        </div>
      </form>

      {showForgot && (
        <ForgotPasswordModal
          userType="rider"
          initialPhone={phone}
          onClose={() => setShowForgot(false)}
          onResetComplete={() => setShowForgot(false)}
        />
      )}
    </main>
  )
}
