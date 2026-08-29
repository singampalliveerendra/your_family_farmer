'use client'

import { useEffect, useRef, useState } from 'react'
import type { UserType } from '@/lib/otp-accounts'
import { useLang } from '@/lib/LanguageContext'

type Step = 'phone' | 'otp' | 'password' | 'done'

const OTP_LEN = 6
const OTP_WINDOW_S = 10 * 60 // 10 minutes
const RESEND_AFTER_S = 60

function maskPhone(p: string) {
  const d = p.replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return p
  return `+91 XXXXXX${d.slice(6)}`
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function ForgotPasswordModal({
  userType,
  initialPhone = '',
  onClose,
  onResetComplete,
}: {
  userType: UserType
  initialPhone?: string
  onClose: () => void
  onResetComplete?: () => void
}) {
  const { L } = useLang()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState(initialPhone.replace(/\D/g, '').slice(-10))
  const [otp, setOtp] = useState<string[]>(Array(OTP_LEN).fill(''))
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [remaining, setRemaining] = useState(0) // OTP countdown (s)
  const [resendIn, setResendIn] = useState(0) // seconds until resend allowed

  const otpRefs = useRef<Array<HTMLInputElement | null>>([])

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Tick the OTP / resend timers once per second while on the OTP step.
  useEffect(() => {
    if (step !== 'otp') return
    const id = setInterval(() => {
      setRemaining((s) => (s > 0 ? s - 1 : 0))
      setResendIn((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [step])

  const phoneDigits = phone.replace(/\D/g, '').slice(-10)
  const otpValue = otp.join('')

  async function sendOtp() {
    if (phoneDigits.length !== 10 || loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneDigits, userType }),
    }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Network error. Please try again.'); return }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? 'Could not send OTP.'); return }
    setOtp(Array(OTP_LEN).fill(''))
    setRemaining(OTP_WINDOW_S)
    setResendIn(RESEND_AFTER_S)
    setStep('otp')
    setTimeout(() => otpRefs.current[0]?.focus(), 50)
  }

  function setOtpDigit(i: number, v: string) {
    const digit = v.replace(/\D/g, '').slice(-1)
    setOtp((prev) => {
      const next = [...prev]
      next[i] = digit
      return next
    })
    if (digit && i < OTP_LEN - 1) otpRefs.current[i + 1]?.focus()
  }

  function onOtpKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  function onOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN)
    if (!text) return
    e.preventDefault()
    const next = Array(OTP_LEN).fill('')
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setOtp(next)
    otpRefs.current[Math.min(text.length, OTP_LEN - 1)]?.focus()
  }

  async function verifyOtp() {
    if (otpValue.length !== OTP_LEN || loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneDigits, userType, otp: otpValue }),
    }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Network error. Please try again.'); return }
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.resetToken) { setError(json.error ?? 'Could not verify OTP.'); return }
    setResetToken(json.resetToken)
    setStep('password')
  }

  async function submitNewPassword() {
    if (loading) return
    if (password.length < 6) { setError(L('Password must be at least 6 characters', 'పాస్‌వర్డ్ కనీసం 6 అక్షరాలు')); return }
    if (password !== confirm) { setError(L('Passwords do not match', 'పాస్‌వర్డ్‌లు సరిపోలలేదు')); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/reset-password-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneDigits, userType, resetToken, newPassword: password }),
    }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Network error. Please try again.'); return }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? 'Could not update password.'); return }
    setStep('done')
    setTimeout(() => onResetComplete?.(), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-gray-900 leading-tight">
            {step === 'phone' && L('Reset Password', 'పాస్‌వర్డ్ రీసెట్ చేయండి')}
            {step === 'otp' && L('Enter OTP', 'OTP నమోదు చేయండి')}
            {step === 'password' && L('Set New Password', 'కొత్త పాస్‌వర్డ్ పెట్టండి')}
            {step === 'done' && L('Done', 'పూర్తయింది')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 text-2xl leading-none px-2 active:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* STEP 1 — phone */}
          {step === 'phone' && (
            <>
              <p className="text-sm text-gray-600">
                {L("Enter your phone number and we'll send you an OTP.", 'మీ ఫోన్ నంబర్‌కు OTP పంపుతాము.')}
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {L('Phone Number', 'ఫోన్ నంబర్')}
                </label>
                <div className="flex items-stretch gap-2">
                  <span className="flex items-center px-3 bg-gray-100 rounded-xl text-sm text-gray-600 font-semibold">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                    placeholder="9876543210"
                    maxLength={10}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button
                onClick={sendOtp}
                disabled={loading || phoneDigits.length !== 10}
                className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 active:bg-green-800"
              >
                {loading ? 'Please wait…' : L('Send OTP', 'OTP పంపండి')}
              </button>
            </>
          )}

          {/* STEP 2 — otp */}
          {step === 'otp' && (
            <>
              {/* Deliberately conditional wording. /api/otp/send answers the same
                  { ok: true } whether or not the number has an account, so that it
                  can't be used to enumerate who is a farmer / rider / consumer /
                  moderator. This copy has to match that: promising "OTP sent"
                  outright would be a lie for an unregistered number and would leave
                  the user staring at a code that is never going to arrive. */}
              <p className="text-sm text-gray-600">
                {L(
                  `If ${maskPhone(phoneDigits)} has an account, the OTP is on its way on WhatsApp.`,
                  `${maskPhone(phoneDigits)}కు ఖాతా ఉంటే, WhatsApp లో OTP వస్తుంది.`,
                )}
              </p>
              <div className="flex justify-between gap-2" onPaste={onOtpPaste}>
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el }}
                    type="tel"
                    inputMode="numeric"
                    value={d}
                    maxLength={1}
                    onChange={(e) => setOtpDigit(i, e.target.value)}
                    onKeyDown={(e) => onOtpKey(i, e)}
                    className="w-11 h-12 text-center text-lg font-bold border border-gray-300 rounded-xl focus:border-green-500 focus:outline-none"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {remaining > 0
                    ? `OTP expires in ${fmt(remaining)}`
                    : L('OTP expired', 'OTP గడువు తీరింది')}
                </span>
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={resendIn > 0 || loading}
                  className="text-green-700 font-bold disabled:text-gray-400"
                >
                  {resendIn > 0
                    ? `Resend in ${resendIn}s`
                    : L('Resend OTP', 'మళ్ళీ పంపండి')}
                </button>
              </div>

              {error && <ErrorBox message={error} />}

              <button
                onClick={verifyOtp}
                disabled={loading || otpValue.length !== OTP_LEN}
                className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 active:bg-green-800"
              >
                {loading ? 'Verifying…' : L('Verify OTP', 'OTP ధృవీకరించండి')}
              </button>
            </>
          )}

          {/* STEP 3 — new password */}
          {step === 'password' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {L('New Password', 'కొత్త పాస్‌వర్డ్')}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
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
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {L('Confirm Password', 'పాస్‌వర్డ్ నిర్ధారించండి')}
                </label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitNewPassword()}
                  placeholder="Re-enter password"
                  maxLength={128}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
                />
              </div>
              {error && <ErrorBox message={error} />}
              <button
                onClick={submitNewPassword}
                disabled={loading}
                className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 active:bg-green-800"
              >
                {loading ? 'Updating…' : L('Update Password', 'పాస్‌వర్డ్ అప్‌డేట్ చేయండి')}
              </button>
            </>
          )}

          {/* STEP 4 — done */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-base font-bold text-gray-900">
                {L('Password updated successfully!', 'పాస్‌వర్డ్ విజయవంతంగా అప్‌డేట్ అయింది')}
              </p>
              <p className="text-xs text-gray-400 mt-3">Redirecting to login…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
      {message}
    </p>
  )
}
