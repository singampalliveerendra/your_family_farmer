'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) { setError(json?.error ?? 'Login failed.'); return }
    router.replace('/admin')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-gray-900 px-4 pt-10 pb-14">
        <h1 className="text-white text-2xl font-extrabold">Owner panel</h1>
        <p className="text-gray-400 text-sm mt-1">Internal · password protected</p>
      </div>
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-md mx-4 -mt-6 p-5 space-y-4 max-w-md w-full mx-auto"
      >
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Admin password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
            required
            autoFocus
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
          className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl text-base active:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Checking...' : 'Log in'}
        </button>
      </form>
    </main>
  )
}
