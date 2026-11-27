'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { HIDDEN_FROM_BUYERS_TAG, readWithSellingUntil, sellerOpen, type SellerVis } from '@/lib/sellerVisibility'

/* An aggregator's produce is shown to buyers only while they hold a Selling
 * plan (src/lib/sellerVisibility.ts, 2026-11-27). On their own produce list
 * each item then carries this tag, so it is clear why buyers can't see it.
 * Farmers never get it. */

/** Are this seller's produce hidden from buyers right now? false while loading or on error. */
export function useHiddenFromBuyers(farmerId: string | null | undefined): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!farmerId) return
    let cancelled = false
    void readWithSellingUntil((withVis) =>
      supabase.from('farmers').select(withVis ? 'account_type, selling_until' : 'account_type').eq('id', farmerId).maybeSingle(),
    ).then(({ data, error, checked }) => {
      if (cancelled || error || !checked || !data) return
      setHidden(!sellerOpen(data as SellerVis))
    })
    return () => { cancelled = true }
  }, [farmerId])
  return hidden
}

export default function HiddenFromBuyersTag() {
  const { L } = useLang()
  return (
    <Link
      href="/aggregator/subscription"
      className="inline-flex items-center gap-1 rounded-full bg-[#f8e1d6] px-2.5 py-1 text-[11px] font-extrabold text-[#7a2a0c]"
    >
      🚫 {L(HIDDEN_FROM_BUYERS_TAG.en, HIDDEN_FROM_BUYERS_TAG.te)} ›
    </Link>
  )
}
