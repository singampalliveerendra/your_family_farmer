'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'
import ModeratorFarmerForm, { emptyFarmerInitial, type Created } from '@/components/moderator/ModeratorFarmerForm'

export default function RegisterFarmerPage() {
  const router = useRouter()
  const { zone, checked } = useModeratorAuth()
  const [created, setCreated] = useState<Created | null>(null)
  // Remount the form on "add another" to reset all its internal state.
  const [formKey, setFormKey] = useState(0)

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  // Success screen: show the activation code to share + profile link.
  if (created) {
    return (
      <ModeratorShell title="Farmer registered" zone={zone}>
        <FarmerCreatedCard
          created={created}
          onAddAnother={() => { setCreated(null); setFormKey((k) => k + 1) }}
          onViewMine={() => router.push('/moderator/my-farmers')}
        />
      </ModeratorShell>
    )
  }

  return (
    <ModeratorShell title="Register new farmer" subtitle="Onboard a farmer on their behalf" zone={zone}>
      <ModeratorFarmerForm
        key={formKey}
        mode="create"
        initial={emptyFarmerInitial()}
        onCreated={(c) => setCreated(c)}
        onCancel={() => router.push('/moderator/farmers')}
      />
    </ModeratorShell>
  )
}

// Success card: shows the shareable activation code (copy + WhatsApp) and the
// live profile link, then lets the moderator add another or view their list.
function FarmerCreatedCard({
  created,
  onAddAnother,
  onViewMine,
}: {
  created: Created
  onAddAnother: () => void
  onViewMine: () => void
}) {
  const [copied, setCopied] = useState(false)
  const code = created.activation_code ?? ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const profileUrl = `${origin}/farmer/${created.slug}`

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked — moderator can still read the code */ }
  }

  const digits = (created.phone ?? '').replace(/\D/g, '')
  const waPhone = digits.length === 10 ? `91${digits}` : digits
  const waText = encodeURIComponent(
    `Welcome to GoGrameen, ${created.name}! 🌱\n\n`
    + `Your activation code: ${code}\n`
    + `Use it to activate your farmer login.\n\n`
    + `Your farm page is live: ${profileUrl}`,
  )
  const waLink = `https://wa.me/${waPhone}?text=${waText}`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md">
      <div className="text-4xl mb-2">✅</div>
      <h2 className="text-lg font-extrabold text-gray-900">{created.name} is registered</h2>
      <p className="text-sm text-gray-500 mt-1">Share this activation code with the farmer:</p>

      {/* Activation code — the headline of this screen. */}
      <div className="mt-3 bg-green-50 border-2 border-dashed border-green-300 rounded-2xl px-4 py-4 flex items-center justify-between gap-3">
        <span className="text-2xl md:text-3xl font-black tracking-widest text-green-900 font-mono break-all">
          {code || '—'}
        </span>
        <button
          onClick={copyCode}
          disabled={!code}
          className="bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-xl active:bg-green-800 whitespace-nowrap disabled:opacity-50"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-3">Their profile page is live:</p>
      <a href={`/farmer/${created.slug}`} target="_blank" className="block text-green-700 underline text-sm mt-1 break-all">{profileUrl}</a>

      <div className="flex flex-col gap-2 mt-5">
        {waPhone && (
          <a
            href={waLink}
            target="_blank"
            className="bg-green-600 text-white text-sm font-bold px-4 py-3 rounded-xl text-center active:bg-green-700"
          >
            Send code via WhatsApp
          </a>
        )}
        <button
          onClick={onAddAnother}
          className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-3 rounded-xl active:bg-gray-50"
        >
          + Register another farmer
        </button>
        <button onClick={onViewMine} className="text-gray-500 text-sm underline">
          View farmers I registered
        </button>
      </div>
    </div>
  )
}
