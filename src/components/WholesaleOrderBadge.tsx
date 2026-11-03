'use client'

import { useLang } from '@/lib/LanguageContext'
import { isWholesaleOrder } from '@/lib/orderType'

// Marks a wholesale order on the farmer's and the buyer's order screens.
// `note` adds who moves it: a farmer-delivered wholesale order ('courier') has
// no rider and no app delivery charge — transport is agreed between them.

type Props = {
  order: { order_type?: unknown; delivery_type?: string | null }
  /** Who is reading: changes "agree with the buyer" vs "with the farmer". */
  audience: 'farmer' | 'buyer'
  note?: boolean
}

export default function WholesaleOrderBadge({ order, audience, note = false }: Props) {
  const { L } = useLang()
  if (!isWholesaleOrder(order)) return null
  const chip = (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-900 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
      <span aria-hidden>🚚</span>
      {L('Wholesale', 'హోల్‌సేల్')}
    </span>
  )
  if (!note) return chip
  const delivered = order.delivery_type === 'courier'
  return (
    <div className="space-y-1">
      {chip}
      <p className="text-[12px] font-semibold text-amber-900 leading-snug">
        {delivered
          ? audience === 'farmer'
            ? L('You deliver this wholesale order — agree the transport charge with the buyer.', 'ఈ హోల్‌సేల్ ఆర్డర్‌ను మీరే డెలివరీ చేయాలి — రవాణా ఛార్జ్ కొనుగోలుదారుతో మాట్లాడుకోండి.')
            : L('The farmer delivers — agree the transport charge with the farmer.', 'రైతు డెలివరీ చేస్తారు — రవాణా ఛార్జ్ రైతుతో మాట్లాడుకోండి.')
          : audience === 'farmer'
            ? L('Wholesale order — the buyer collects from you.', 'హోల్‌సేల్ ఆర్డర్ — కొనుగోలుదారు మీ దగ్గర తీసుకెళ్తారు.')
            : L('Wholesale order — collect it from the farmer.', 'హోల్‌సేల్ ఆర్డర్ — రైతు దగ్గర తీసుకెళ్లండి.')}
      </p>
    </div>
  )
}
