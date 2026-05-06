'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'

type Mode = 'password' | 'otp'

export default function FarmerLoginPage() {
  const router = useRouter()

  // Shared
  const [phone, setPhone] = useState('')
  const [mode, setMode]   = useState<Mode>('password')

  // Password mode
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError]   = useState('')

  // OTP mode
  const [otpSent, setOtpSent]     = useState(false)
  const [otp, setOtp]             = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError]   = useState('')

  const digits    = phone.replace(/\D/g, '').slice(-10)
  const canSubmit = digits.length === 10 && password.length >= 4
  const canSendOtp = digits.length === 10

  const switchMode = (m: Mode) => {
    setMode(m)
    setOtpSent(false)
    setOtp('')
    setOtpError('')
    setPwError('')
  }

  /* ── Password login ── */
  const handleLogin = async () => {
    if (!canSubmit) return
    setPwLoading(true)
    setPwError('')
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits, password }),
    })
    const json = await res.json().catch(() => ({}))
    setPwLoading(false)
    if (!res.ok) { setPwError(json.error ?? 'Could not log in. Please try again.'); return }
    localStorage.setItem('yff_farmer_id', json.farmerId)
    localStorage.setItem('yff_farmer_slug', json.farmerSlug)
    router.replace('/farmer/dashboard')
  }

  /* ── Send OTP ── */
  const handleSendOtp = async () => {
    if (!canSendOtp) return
    setOtpLoading(true)
    setOtpError('')
    const res  = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits }),
    })
    const json = await res.json().catch(() => ({}))
    setOtpLoading(false)
    if (!res.ok) { setOtpError(json.error ?? 'Could not send OTP. Try again.'); return }
    setOtpSent(true)
  }

  /* ── Verify OTP ── */
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return
    setOtpLoading(true)
    setOtpError('')
    const res  = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits, otp }),
    })
    const json = await res.json().catch(() => ({}))
    setOtpLoading(false)
    if (!res.ok) { setOtpError(json.error ?? 'Invalid OTP. Try again.'); return }
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
        {/* Logo */}
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

          {/* ── Phone (always shown) ── */}
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
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') mode === 'password' ? handleLogin() : handleSendOtp() }}
                disabled={mode === 'otp' && otpSent}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                maxLength={10}
              />
            </div>
          </div>

          {/* ── PASSWORD MODE ── */}
          {mode === 'password' && (
            <>
              <div>
                <div className="mb-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Password / పాస్‌వర్డ్
                  </label>
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Minimum 4 characters"
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

              {pwError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{pwError}</p>
              )}

              <button
                onClick={handleLogin}
                disabled={pwLoading || !canSubmit}
                className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800 transition-colors"
              >
                {pwLoading ? 'Please wait…' : 'Continue / కొనసాగండి'}
              </button>

              <p className="text-xs text-gray-500 text-center leading-snug">
                New here? Enter your number and choose a password — we&apos;ll create your account.<br />
                కొత్తవారా? నంబర్ మరియు పాస్‌వర్డ్ నమోదు చేయండి.
              </p>
            </>
          )}

          {/* ── OTP MODE ── */}
          {mode === 'otp' && (
            <>
              {!otpSent ? (
                <>
                  <p className="text-sm text-gray-600 bg-blue-50 rounded-xl px-3 py-2.5 leading-snug">
                    We&apos;ll send a 6-digit code to your phone.<br />
                    <span className="text-xs text-gray-500">మీ ఫోన్‌కు 6-అంకెల కోడ్ పంపుతాం.</span>
                  </p>

                  {otpError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{otpError}</p>
                  )}

                  <button
                    onClick={handleSendOtp}
                    disabled={otpLoading || !canSendOtp}
                    className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800 transition-colors"
                  >
                    {otpLoading ? 'Sending…' : 'Send OTP / OTP పంపండి'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2.5 leading-snug">
                    OTP sent to +91 {digits}<br />
                    <span className="text-xs text-gray-500">+91 {digits} కు OTP పంపబడింది</span>
                  </p>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-2">
                      Enter 6-digit OTP / 6-అంకెల OTP నమోదు చేయండి
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-center tracking-widest font-bold focus:border-green-500 focus:outline-none"
                      maxLength={6}
                      autoFocus
                    />
                  </div>

                  {otpError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{otpError}</p>
                  )}

                  <button
                    onClick={handleVerifyOtp}
                    disabled={otpLoading || otp.length !== 6}
                    className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800 transition-colors"
                  >
                    {otpLoading ? 'Verifying…' : 'Verify & Login / లాగిన్ చేయండి'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(''); setOtpError('') }}
                    className="w-full text-sm text-gray-500 py-1"
                  >
                    Resend OTP / మళ్ళీ పంపండి
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => switchMode('password')}
                className="w-full text-sm text-green-700 font-medium py-1 underline"
              >
                ← Back to password login / పాస్‌వర్డ్‌తో లాగిన్
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link href="/consumer" className="text-green-700 underline">
            Browse produce instead / పంట బ్రౌజ్ చేయండి
          </Link>
        </p>
      </div>
    </main>
  )
}
