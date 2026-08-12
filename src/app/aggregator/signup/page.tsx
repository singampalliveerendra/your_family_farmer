'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import { useLang } from '@/lib/LanguageContext'

// Step 1 of aggregator registration. Kept short on purpose — the remaining
// spec fields (village, district, operating since, location, cover photo,
// personal photo, business certificate, organic certificate, pickup locations)
// are collected in the dashboard profile editor once the account exists, so a
// dropped 4G connection doesn't cost the whole signup.

export default function AggregatorSignupPage() {
  const { L } = useLang()
  const router = useRouter()
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const digits = phone.replace(/\D/g, '').slice(-10)
  const canSubmit =
    name.trim().length > 0 &&
    contactPerson.trim().length > 0 &&
    digits.length === 10 &&
    password.length >= 6 &&
    terms

  const handleSubmit = async () => {
    if (!canSubmit || loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/aggregator/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: name.trim(),
        contact_person: contactPerson.trim(),
        phone: digits,
        password,
        terms_accepted: true,
      }),
    }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Network error. Please try again.'); return }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json?.error ?? 'Could not create account.'); return }
    localStorage.setItem('yff_farmer_id', json.farmerId)
    localStorage.setItem('yff_farmer_slug', json.farmerSlug)
    router.replace('/aggregator/dashboard')
  }

  const inputCls =
    'w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none'

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle variant="light" />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/consumer" className="inline-flex flex-col items-center">
            <div className="w-16 h-16 bg-green-700 rounded-2xl flex items-center justify-center mb-3">
              <span className="text-white font-black text-2xl">🤝</span>
            </div>
          </Link>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {L('Aggregator Signup', 'అగ్రిగేటర్ సైన్ అప్')}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {L(
              'Sell produce you collect from organic farmers',
              'సేంద్రియ రైతుల నుండి సేకరించిన పంటలను అమ్మండి',
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              {L('Name of the organisation', 'సంస్థ పేరు')}
            </label>
            <input
              type="text"
              placeholder={L('Organisation name', 'సంస్థ పేరు')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              {L('Person behind the organisation', 'సంస్థ నిర్వాహకుడి పేరు')}
            </label>
            <input
              type="text"
              placeholder={L('Full name', 'పూర్తి పేరు')}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              maxLength={80}
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              {L('WhatsApp number', 'వాట్సాప్ నంబర్')}
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
                maxLength={10}
                className={`flex-1 ${inputCls}`}
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
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium px-1"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{L('Minimum 6 characters', 'కనీసం 6 అక్షరాలు')}</p>
          </div>

          {/* Terms & Conditions. These are the product's trust claim, so the
              agreement is recorded as terms_accepted_at, and the API rejects a
              submission without it rather than trusting the checkbox. */}
          <div className="border border-green-200 bg-green-50 rounded-xl p-3">
            <p className="text-xs font-extrabold text-green-900 mb-2">
              {L('Aggregator agreement', 'అగ్రిగేటర్ ఒప్పందం')}
            </p>
            <div className="text-[11px] text-gray-700 leading-relaxed space-y-1.5 max-h-44 overflow-y-auto pr-1">
              <p>
                I am an aggregator who aggregates various agricultural produce, committed to
                passing on greater benefit to the farmers and keeping only the minimum needed
                to run the business.
              </p>
              <p>
                I will maintain transparency between the farmers and the consumers. I will
                provide all the necessary information of the farmer — name, address and
                phone number — for each harvest I aggregate, and I will never combine the
                harvests of different farmers into one listing.
              </p>
              <p>
                I will pass on the feedback I receive from consumers to the farmer, so that
                the farmer can improve their farming methods.
              </p>
              <p>
                I confirm that every farmer I list has agreed to their name, village and
                phone number being shown to buyers on this platform.
              </p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none mt-3 pt-3 border-t border-green-200">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-green-600 shrink-0"
              />
              <span className="text-xs font-bold text-green-900">
                {L('I agree to the above', 'నేను పైవాటికి అంగీకరిస్తున్నాను')}
              </span>
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !canSubmit}
            className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800 transition-colors"
          >
            {loading ? 'Creating account…' : L('Create account', 'ఖాతా సృష్టించండి')}
          </button>

          <p className="text-[11px] text-gray-500 text-center leading-relaxed">
            {L(
              'Next: add the farmers you buy from, then start logging harvests.',
              'తర్వాత: మీరు కొనుగోలు చేసే రైతులను జోడించి, కోతలు నమోదు చేయడం ప్రారంభించండి.',
            )}
          </p>

          <div className="text-xs text-gray-600 text-center pt-1">
            Already have an account?{' '}
            <Link href="/aggregator/login" className="text-green-700 font-bold underline">
              Log in
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {L('Growing your own produce instead?', 'మీరే పండిస్తున్నారా?')}{' '}
          <Link href="/farmer/signup" className="text-green-700 underline">
            {L('Farmer signup', 'రైతు సైన్ అప్')}
          </Link>
        </p>
      </div>
    </main>
  )
}
