'use client'

import { useLang } from '@/lib/LanguageContext'
import { formatHarvestDate } from '@/lib/harvestSchedule'

/**
 * The one thing standing between a buyer and an order for produce that does not
 * exist yet.
 *
 * A finished harvest no longer reads "Sold out" anywhere in the shop — the
 * produce stays browsable and buyable, because the farmer will pick it again.
 * What replaces the dead button is this: the buyer is told plainly that the
 * latest harvest is gone and roughly when the next one lands, and has to say
 * yes before anything reaches their cart.
 *
 * The date comes from the farmer's own harvesting cadence
 * (src/lib/harvestSchedule.ts). When they have not set one there is no honest
 * date to give, so the sheet says so rather than inventing "next week" — a
 * vaguer promise is better than a wrong one, and the buyer is paying up front.
 */
export default function PreorderConfirm({
  produceName,
  expectedDate,
  onConfirm,
  onCancel,
}: {
  produceName: string
  expectedDate: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { L } = useLang()
  const when = formatHarvestDate(expectedDate)

  return (
    <div
      className="fixed inset-0 z-[160] bg-black/60 flex items-end sm:items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preorder-title"
    >
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden>🌾</span>
          <div className="min-w-0">
            <h2 id="preorder-title" className="text-base font-extrabold text-gray-900 leading-tight">
              {L('The latest harvest is finished', 'తాజా కోత అయిపోయింది')}
            </h2>
            <p className="text-sm text-gray-600 leading-snug mt-1">
              {when
                ? L(
                    `${produceName} is picked again around ${when}. Your order waits for that harvest.`,
                    `${produceName} సుమారు ${when} న మళ్లీ కోస్తారు. మీ ఆర్డర్ ఆ కోత కోసం వేచి ఉంటుంది.`,
                  )
                : L(
                    `${produceName} will be picked again soon, but the farmer has not set a date. Your order waits for the next harvest.`,
                    `${produceName} త్వరలో మళ్లీ కోస్తారు, కానీ రైతు తేదీ పెట్టలేదు. మీ ఆర్డర్ తదుపరి కోత కోసం వేచి ఉంటుంది.`,
                  )}
            </p>
          </div>
        </div>

        {/* The farmer can still decline — say so here rather than after the
            money has moved. */}
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug">
          {L(
            'You pay at checkout as usual. If the farmer cannot supply it, the order is declined and you are refunded in full.',
            'మీరు ఎప్పటిలాగే చెల్లిస్తారు. రైతు సరఫరా చేయలేకపోతే, ఆర్డర్ తిరస్కరించబడి మీకు పూర్తి డబ్బు తిరిగి వస్తుంది.',
          )}
        </p>

        <div className="space-y-2">
          <button
            onClick={onConfirm}
            className="w-full bg-green-700 text-white font-extrabold py-3.5 rounded-2xl text-sm active:bg-green-800 leading-tight"
          >
            {L('Yes, add to cart', 'అవును, కార్ట్‌లో చేర్చు')}
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-white border border-gray-200 text-gray-700 font-bold py-3 rounded-2xl text-sm active:bg-gray-50"
          >
            {L('No, not now', 'వద్దు, ఇప్పుడు కాదు')}
          </button>
        </div>
      </div>
    </div>
  )
}
