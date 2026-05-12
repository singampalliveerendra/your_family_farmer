'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RiderActivatePage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    const r = await fetch('/api/rider/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone, code }),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) { setError(json?.error ?? 'Could not activate.'); return }
    router.replace('/rider/login?activated=1')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-green-900 px-4 pt-8 pb-12">
        <h1 className="text-white text-2xl font-extrabold">Activate your account</h1>
        <p className="text-green-300 text-sm mt-1">యాక్టివేషన్ కోడ్ నమోదు చేయండి</p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-md mx-4 -mt-6 p-5 space-y-4 max-w-md w-full mx-auto"
      >
        <p className="text-xs text-gray-600 leading-snug bg-gray-50 rounded-xl px-3 py-2">
          Enter the activation code you received from the owner. After this, log in with your phone and password.
        </p>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Phone number / ఫోన్ నంబర్
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
              maxLength={10}
              placeholder="9876543210"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              required
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Activation code / యాక్టివేషన్ కోడ్
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="YFF-K2847"
            maxLength={20}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none uppercase tracking-wider font-mono font-bold text-center"
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
          {submitting ? 'Activating...' : 'Activate / యాక్టివేట్ చేయండి'}
        </button>

        <div className="text-xs text-gray-600 text-center pt-2 space-y-1">
          <p>
            Don&apos;t have an account?{' '}
            <Link href="/rider/signup" className="text-green-700 font-bold underline">Apply first</Link>
          </p>
          <p>
            Already activated?{' '}
            <Link href="/rider/login" className="text-green-700 font-bold underline">Log in</Link>
          </p>
        </div>
      </form>
    </main>
  )
}
