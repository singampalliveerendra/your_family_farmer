'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import ForgotPasswordModal from '@/components/ForgotPasswordModal'
import { useLang } from '@/lib/LanguageContext'

// The one login form behind BOTH /farmer/login and /aggregator/login.
//
// Farmers and aggregators are the same `farmers` row, the same password hash
// and the same `yff_farmer` cookie — only the wording, the sign-up link and the
// dashboard differ. So this is parameterised rather than copied: a fix to the
// session handling, the rate-limit messaging or the forgot-password flow lands
// on both surfaces at once.

export type SellerType = 'farmer' | 'aggregator'

type Surface = {
  titleEn: string
  titleTe: string
  signupHref: string
  dashboard: string
  /** Paths this surface will honour in ?next= (in-app only, never absolute). */
  nextPrefixes: string[]
}

const SURFACE: Record<SellerType, Surface> = {
  farmer: {
    titleEn: 'Farmer Login',
    titleTe: 'రైతు లాగిన్',
    signupHref: '/farmer/signup',
    dashboard: '/farmer/dashboard',
    nextPrefixes: ['/farmer/'],
  },
  aggregator: {
    titleEn: 'Aggregator Login',
    titleTe: 'సమీకరణదారు లాగిన్',
    signupHref: '/aggregator/signup',
    dashboard: '/aggregator/dashboard',
    // Aggregators work inside farmer-scoped pages too (order detail, payouts),
    // so a bounce from one of those must be able to return them there.
    nextPrefixes: ['/aggregator/', '/farmer/'],
  },
}

export default function SellerLoginForm({ accountType }: { accountType: SellerType }) {
  const surface = SURFACE[accountType]
  const { L } = useLang()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // True when the entered number has no seller account — we show a sign-up prompt
  // instead of the generic "wrong phone or password" error.
  const [notRegistered, setNotRegistered] = useState(false)
  // Set when the password was right but the account belongs to the OTHER
  // surface; holds the login path to send them to.
  const [wrongSurface, setWrongSurface] = useState<string | null>(null)
  // The number has no account on THIS surface, and may open one — a farmer who
  // has started a collection shop can hold both.
  const [canSignUp, setCanSignUp] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  // Set when farmerFetch/requireFarmerSession bounced the seller here.
  const sessionEnded = searchParams.get('reason') === 'expired'

  // Return the seller to the page they were bounced off. Only in-app paths for
  // this surface are honoured — an absolute URL here would make login an open
  // redirect, and '//host' is rejected because the browser reads it as one.
  const nextPath = (): string => {
    const next = searchParams.get('next') ?? ''
    const allowed = surface.nextPrefixes.some(
      (p) => next.startsWith(p) && !next.startsWith(`${p}/`),
    )
    return allowed ? next : surface.dashboard
  }

  const digits = phone.replace(/\D/g, '').slice(-10)
  const canSubmit = digits.length === 10 && password.length >= 4

  const handleLogin = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    setNotRegistered(false)
    setWrongSurface(null)
    setCanSignUp(false)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone: digits, password, accountType }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      if (json.notRegistered) { setNotRegistered(true); return }
      if (json.wrongSurface && typeof json.loginPath === 'string') {
        setWrongSurface(json.loginPath)
        setCanSignUp(json.canSignUp === true)
        setError(json.error ?? '')
        return
      }
      setError(json.error ?? 'Could not log in. Please try again.')
      return
    }
    localStorage.setItem('yff_farmer_id', json.farmerId)
    localStorage.setItem('yff_farmer_slug', json.farmerSlug)
    router.replace(nextPath())
  }

  // Carry ?next= and ?reason= across when sending them to the other login, so a
  // seller bounced out of a deep page still lands back on it after logging in.
  const otherLoginHref = (path: string): string => {
    const qs = searchParams.toString()
    return qs ? `${path}?${qs}` : path
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle variant="light" />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/consumer" className="inline-flex flex-col items-center">
            <div className="w-16 h-16 bg-green-700 rounded-2xl flex items-center justify-center mb-3">
              <span className="text-white font-black text-lg">YFF</span>
            </div>
          </Link>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {L(surface.titleEn, surface.titleTe)}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {L('Sign in to your account', 'మీ ఖాతాలోకి సైన్ ఇన్ చేయండి')}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              {L('Phone Number', 'ఫోన్ నంబర్')}
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
              {L('Password', 'పాస్‌వర్డ్')}
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

          {sessionEnded && !error && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {L('Your session ended. Please log in again to continue.', 'మీ సెషన్ ముగిసింది. కొనసాగించడానికి మళ్ళీ లాగిన్ చేయండి.')}
            </p>
          )}

          {error && !notRegistered && !wrongSurface && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          {/* Right password, wrong login page. One tap to the correct one. */}
          {wrongSurface && (
            <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
              <p className="font-semibold">{error}</p>
              <Link
                href={otherLoginHref(wrongSurface)}
                className="inline-block bg-amber-600 text-white font-bold px-4 py-2 rounded-lg active:bg-amber-700"
              >
                {accountType === 'farmer'
                  ? L('Go to aggregator login', 'సమీకరణదారు లాగిన్‌కు వెళ్లండి')
                  : L('Go to farmer login', 'రైతు లాగిన్‌కు వెళ్లండి')}
              </Link>
              {/* Both kinds of account can coexist on one number, so offer to
                  open this one rather than treating the mismatch as a dead end. */}
              {canSignUp && (
                <p className="text-amber-800 pt-1">
                  {accountType === 'aggregator'
                    ? L('Collecting from other farmers now?', 'ఇప్పుడు ఇతర రైతుల నుండి సేకరిస్తున్నారా?')
                    : L('Also growing your own produce?', 'మీ సొంత పంటలు కూడా పండిస్తున్నారా?')}{' '}
                  <Link
                    href={`${surface.signupHref}?phone=${digits}`}
                    className="font-bold underline whitespace-nowrap"
                  >
                    {accountType === 'aggregator'
                      ? L('Create an aggregator account', 'సమీకరణదారు ఖాతా సృష్టించండి')
                      : L('Create a farmer account', 'రైతు ఖాతా సృష్టించండి')}
                  </Link>
                </p>
              )}
            </div>
          )}

          {notRegistered && (
            <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
              <p className="font-semibold">
                {L('No account found for this number.', 'ఈ నంబర్‌కు ఖాతా కనబడలేదు.')}
              </p>
              <p className="text-amber-800">
                {L('Please create an account first, then log in.', 'దయచేసి ముందు ఖాతా సృష్టించి, ఆపై లాగిన్ చేయండి.')}
              </p>
              <Link
                href={`${surface.signupHref}?phone=${digits}`}
                className="inline-block bg-amber-600 text-white font-bold px-4 py-2 rounded-lg active:bg-amber-700"
              >
                {L('Create an account', 'ఖాతా సృష్టించండి')}
              </Link>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !canSubmit}
            className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800 transition-colors"
          >
            {loading ? 'Please wait…' : L('Log in', 'లాగిన్')}
          </button>

          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="w-full text-center text-sm text-green-700 font-semibold underline"
          >
            {L('Forgot Password?', 'పాస్‌వర్డ్ మర్చిపోయారా?')}
          </button>

          <div className="text-xs text-gray-600 text-center pt-1">
            New here?{' '}
            <Link href={surface.signupHref} className="text-green-700 font-bold underline">
              {L('Create an account', 'ఖాతా సృష్టించండి')}
            </Link>
          </div>

          {/* Each surface points at the other, so a seller who picked the wrong
              one can cross over without going back to the menu. */}
          <div className="text-xs text-gray-600 text-center border-t border-gray-100 pt-3">
            {accountType === 'farmer' ? (
              <>
                {L('Do you collect produce from other farmers?', 'ఇతర రైతుల నుండి పంటలు సేకరిస్తారా?')}{' '}
                <Link href="/aggregator/login" className="text-green-700 font-bold underline whitespace-nowrap">
                  🤝 {L('Aggregator login', 'సమీకరణదారు లాగిన్')}
                </Link>
              </>
            ) : (
              <>
                {L('Growing your own produce?', 'మీ సొంత పంటలు పండిస్తున్నారా?')}{' '}
                {/* ?switch=1 so the farmer form is shown even when a live
                    session already exists — one phone can hold both a farmer
                    and an aggregator account, and this link is how a seller
                    signed into one reaches the other. */}
                <Link href="/farmer/login?switch=1" className="text-green-700 font-bold underline whitespace-nowrap">
                  🌾 {L('Farmer login', 'రైతు లాగిన్')}
                </Link>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link href="/consumer" className="text-green-700 underline">
            {L('Browse harvests instead', 'కోతలు బ్రౌజ్ చేయండి')}
          </Link>
        </p>
      </div>

      {showForgot && (
        // Pass the surface, not a fixed 'farmer': one number can hold both a
        // farmer and an aggregator account, each with its own password, so the
        // reset has to land on the one they are actually resetting.
        <ForgotPasswordModal
          userType={accountType}
          initialPhone={phone}
          onClose={() => setShowForgot(false)}
          onResetComplete={() => setShowForgot(false)}
        />
      )}
    </main>
  )
}
