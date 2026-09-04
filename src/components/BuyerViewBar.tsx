'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { readBuyerView, sellerDashboardPath, showsBuyerViewBar, type SellerRole } from '@/lib/buyerView'

/**
 * "You are shopping as a buyer — back to my dashboard."
 *
 * Rendered from the root layout so it follows the seller across every buyer
 * page they wander onto (browse, a produce page, the cart, their own public
 * profile), not just the one they switched from. It reads the marker cookie
 * rather than asking the server, so it costs nothing on 4G and never delays a
 * page it sits on top of.
 *
 * Deliberately NOT sticky: the buyer pages already stack a sticky nav, a cart
 * FAB and per-page action bars at both edges of a 390px screen, and a fourth
 * competing layer is worse than scrolling back up. The same link also lives in
 * the ⚙️ menu, which IS always on screen.
 */
export default function BuyerViewBar() {
  const pathname = usePathname()
  const { L } = useLang()
  const [role, setRole] = useState<SellerRole | null>(null)

  // Cookie is read after mount: the server render has no business guessing it,
  // and doing it per-pathname keeps the bar honest after a farmer logout that
  // cleared the marker in another tab.
  useEffect(() => { setRole(readBuyerView()) }, [pathname])

  if (!role || !showsBuyerViewBar(pathname)) return null

  return (
    <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3">
      <p className="text-[11px] font-bold text-amber-900 leading-snug min-w-0">
        <span aria-hidden className="mr-1">🛒</span>
        {L('Buyer view — you are shopping as a customer.', 'కొనుగోలుదారు వీక్షణ — మీరు కస్టమర్‌గా చూస్తున్నారు.')}
      </p>
      <Link
        href={sellerDashboardPath(role)}
        className="flex-shrink-0 text-[11px] font-extrabold text-white bg-amber-700 active:bg-amber-800 rounded-full px-3 py-1.5 leading-none"
      >
        {role === 'aggregator'
          ? L('↩ My dashboard', '↩ నా డాష్‌బోర్డ్')
          : L('↩ My farm', '↩ నా వ్యవసాయం')}
      </Link>
    </div>
  )
}
