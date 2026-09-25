'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { sellerSwitchTargets, type SellerRole } from '@/lib/buyerView'

/**
 * "Switch role" for the seller's ⚙️ Settings sheet — the same list the consumer
 * ⚙️ menu shows, so the two sides of the app read alike.
 *
 * "Shop as Consumer" goes through enterBuyerMode() like the dashboard's Buyer
 * view card, not a bare /consumer link: a seller has no buyer session, and
 * landing in the shop signed out would ask them to sign up a second time.
 */
export default function SellerSwitchRole({ current }: { current: SellerRole }) {
  const { L } = useLang()
  const router = useRouter()
  const { enterBuyerMode } = useConsumerAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shop = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await enterBuyerMode().catch(() => ({
      ok: false as const,
      error: L('No internet. Please try again.', 'ఇంటర్నెట్ లేదు. మళ్లీ ప్రయత్నించండి.'),
    }))
    if (!result.ok) {
      setBusy(false)
      setError(result.error)
      return
    }
    router.push('/consumer')
  }

  const label: Record<'farmer' | 'aggregator' | 'rider', string> = {
    farmer: L('🧑‍🌾 Login as Farmer', 'రైతుగా లాగిన్'),
    aggregator: L('🤝 Login as Aggregator', 'సమీకరణదారుగా లాగిన్'),
    rider: L('🛵 Login as Delivery', 'డెలివరీగా లాగిన్'),
  }

  return (
    <div className="text-sm">
      <p className="py-2 text-[11px] text-gray-500 leading-tight">
        {L('Switch role', 'పాత్ర మార్చండి')}
      </p>
      <button
        onClick={shop}
        disabled={busy}
        className="block w-full text-left py-2.5 text-gray-800 active:bg-gray-100 disabled:opacity-60"
      >
        {busy ? L('Opening…', 'తెరుస్తోంది…') : L('🛒 Shop as Consumer', 'కొనుగోలుదారుగా')}
      </button>
      {error && <p className="text-xs font-semibold text-red-600 pb-2 leading-snug">{error}</p>}
      {sellerSwitchTargets(current).map((t) => (
        <Link key={t.role} href={t.href} className="block py-2.5 text-gray-800 active:bg-gray-100">
          {label[t.role]}
        </Link>
      ))}
    </div>
  )
}
