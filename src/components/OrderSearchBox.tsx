'use client'

import { useMemo } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { PRODUCE_NAME_TE } from '@/lib/produceNamesTe'
import { hasLatinLetters, teluguPreview } from '@/lib/teluguTranslit'

// The search box on the Orders pages (buyer active + history, farmer and
// aggregator). Matching lives in src/lib/orderSearch.ts; this is just the input
// plus, for a Telugu user typing on an English keyboard, a line showing the
// Telugu we understood ("వెతుకుతోంది: టమాటా") so they know it worked.
export default function OrderSearchBox({
  value,
  onChange,
  matchCount,
  vocabulary,
}: {
  value: string
  onChange: (value: string) => void
  /** How many orders match, shown once the user has typed. */
  matchCount: number
  /** Telugu text from the loaded orders, so the preview can use real spellings. */
  vocabulary: string[]
}) {
  const { L, lang } = useLang()
  const query = value.trim()

  const preview = useMemo(() => {
    if (lang !== 'te' || !query || !hasLatinLetters(query)) return ''
    return teluguPreview(query, [...Object.values(PRODUCE_NAME_TE), ...vocabulary])
  }, [lang, query, vocabulary])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden>🔍</span>
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 80))}
          placeholder={L('Search: crop, name, order no.', 'వెతకండి: పంట, పేరు, ఆర్డర్ నం.')}
          aria-label={L('Search orders', 'ఆర్డర్లు వెతకండి')}
          // 16px text so iOS Safari doesn't zoom the page on focus.
          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-10 py-2.5 text-base focus:border-green-500 focus:bg-white focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 text-xl leading-none active:text-gray-600"
            aria-label={L('Clear search', 'వెతుకుట తీసివేయండి')}
          >
            ×
          </button>
        )}
      </div>

      {query ? (
        <p className="text-[11px] text-gray-500 mt-1.5 px-1 leading-snug">
          {preview && (
            <>
              {L('Searching', 'వెతుకుతోంది')}: <span className="font-bold text-gray-800">{preview}</span>
              {' · '}
            </>
          )}
          {matchCount === 1
            ? L('1 order', '1 ఆర్డర్')
            : L(`${matchCount} orders`, `${matchCount} ఆర్డర్లు`)}
        </p>
      ) : lang === 'te' ? (
        <p className="text-[11px] text-gray-400 mt-1.5 px-1 leading-snug">
          తెలుగులో లేదా ఇంగ్లీష్ అక్షరాలతో టైప్ చేయండి (ఉదా: tamata)
        </p>
      ) : null}
    </div>
  )
}
