'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import ForgotPasswordModal from '@/components/ForgotPasswordModal'

export default function FarmerLoginPage() {
  const router = useRouter()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgot, setShowForgot] = useState(false)

  const digits = phone.replace(/\D/g, '').slice(-10)
  const canSubmit = digits.length === 10 && password.length >= 4

  const handleLogin = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone: digits, password }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Could not log in. Please try again.'); return }
    localStorage.setItem('yff_farmer_id', json.farmerId)
    localStorage.setItem('yff_farmer_slug', json.farmerSlug)
    router.replace('/farmer/dashboard')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/consumer" className="inline-flex flex-col items-center">
            <div className="w-16 h-16 bg-green-700 rounded-2xl flex items-center justify-center mb-3">
              <span className="text-white font-black text-lg">YFF</span>
            </div>
          </Link>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Farmer Login / రైతు లాగిన్
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Sign in to your account / మీ ఖాతాలోకి సైన్ ఇన్ చేయండి
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Phone Number / ఫోన్ నంబర్
            </label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium whitespace-nowrap">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
                maxLength={10}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Password / పాస్‌వర్డ్
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-base focus:border-green-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium px-1"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !canSubmit}
            className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800 transition-colors"
          >
            {loading ? 'Please wait…' : 'Log in / లాగిన్'}
          </button>

          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="w-full text-center text-sm text-green-700 font-semibold underline"
          >
            Forgot Password? / పాస్‌వర్డ్ మర్చిపోయారా?
          </button>

          <div className="text-xs text-gray-600 text-center pt-1">
            New here?{' '}
            <Link href="/farmer/signup" className="text-green-700 font-bold underline">
              Create an account / ఖాతా సృష్టించండి
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link href="/consumer" className="text-green-700 underline">
            Browse produce instead / పంట బ్రౌజ్ చేయండి
          </Link>
        </p>
      </div>

      {showForgot && (
        <ForgotPasswordModal
          userType="farmer"
          initialPhone={phone}
          onClose={() => setShowForgot(false)}
          onResetComplete={() => setShowForgot(false)}
        />
      )}
    </main>
  )
}
