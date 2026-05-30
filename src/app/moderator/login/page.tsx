'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ModeratorLoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    const r = await fetch('/api/moderator/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone, password }),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error. / నెట్‌వర్క్ లోపం'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) { setError(json?.error ?? 'Login failed. / లాగిన్ విఫలమైంది'); return }
    router.replace('/moderator')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-green-950 px-4 pt-10 pb-14">
        <h1 className="text-white text-2xl font-extrabold">GoGrameen Moderator</h1>
        <p className="text-green-300 text-sm">జోన్ మోడరేటర్</p>
        <p className="text-green-400/70 text-xs mt-1">Internal · phone + password / అంతర్గత · ఫోన్ + పాస్‌వర్డ్</p>
      </div>
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-md mx-4 -mt-6 p-5 space-y-4 max-w-md w-full mx-auto"
      >
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Phone number / ఫోన్ నంబర్
          </label>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Password / పాస్‌వర్డ్
          </label>
          <input
            type="password"
            autoComplete="current-password"
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
          className="w-full bg-green-800 text-white font-bold py-4 rounded-xl text-base active:bg-green-900 disabled:opacity-50"
        >
          {submitting ? 'Checking... / తనిఖీ చేస్తోంది...' : 'Log in / లాగిన్'}
        </button>
      </form>
    </main>
  )
}
