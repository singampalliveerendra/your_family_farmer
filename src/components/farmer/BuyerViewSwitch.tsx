'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

/**
 * The seller's way over to the buyer side — one tap, no second sign-up.
 *
 * Two destinations because sellers arrive here for two different reasons:
 * they want to BUY from other farmers, or they want to check how their own
 * harvest reads on a buyer's phone before they trust it to sell. Both need the
 * same buyer session, so both go through `enterBuyerMode()`; only the landing
 * page differs.
 *
 * The seller session is untouched throughout, and the amber bar that follows
 * them around the shop brings them back here.
 */
export default function BuyerViewSwitch({ slug }: { slug: string | null }) {
  const { L } = useLang()
  const router = useRouter()
  const { enterBuyerMode } = useConsumerAuth()
  const [busy, setBusy] = useState<'shop' | 'preview' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const go = async (where: 'shop' | 'preview') => {
    if (busy) return
    setBusy(where)
    setError(null)
    const result = await enterBuyerMode().catch(() => ({
      ok: false as const,
      error: L('No internet. Please try again.', 'ఇంటర్నెట్ లేదు. మళ్లీ ప్రయత్నించండి.'),
    }))
    if (!result.ok) {
      setBusy(null)
      setError(result.error)
      return
    }
    // No setBusy(null): the button stays in its loading state until the new
    // page paints, so a farmer on slow 4G doesn't tap it a second time.
    router.push(where === 'preview' && slug ? `/farmer/${slug}` : '/consumer')
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h2 className="font-extrabold text-gray-900 text-base leading-tight flex items-center gap-2">
        <span aria-hidden>🛒</span>
        {L('Buyer view', 'కొనుగోలుదారు వీక్షణ')}
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3 leading-snug">
        {L(
          'Shop from other farmers, or see your own harvests exactly as a buyer sees them. You stay logged in here.',
          'ఇతర రైతుల నుండి కొనండి, లేదా మీ కోతలు కొనుగోలుదారుకు ఎలా కనిపిస్తాయో చూడండి. మీరు ఇక్కడ లాగిన్‌లోనే ఉంటారు.',
        )}
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => go('shop')}
          disabled={busy !== null}
          className="bg-green-700 text-white font-bold text-sm rounded-xl px-3 py-3 leading-tight active:bg-green-800 disabled:opacity-60"
        >
          {busy === 'shop'
            ? L('Opening…', 'తెరుస్తోంది…')
            : L('🛒 Shop as buyer', '🛒 కొనుగోలుదారుగా')}
        </button>
        <button
          onClick={() => go('preview')}
          disabled={busy !== null || !slug}
          className="bg-white border-2 border-green-700 text-green-800 font-bold text-sm rounded-xl px-3 py-3 leading-tight active:bg-green-50 disabled:opacity-60"
        >
          {busy === 'preview'
            ? L('Opening…', 'తెరుస్తోంది…')
            : L('👁 Preview my shop', '👁 నా షాప్ ప్రివ్యూ')}
        </button>
      </div>

      {error && (
        <p className="text-xs font-semibold text-red-600 mt-2.5 leading-snug">{error}</p>
      )}
    </div>
  )
}
