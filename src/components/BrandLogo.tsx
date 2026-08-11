'use client'

import { useLang } from '@/lib/LanguageContext'

/* The one place the Go Grameen lockup is drawn. The header and the splash
   screen both render this so the mark, the type and the spacing can never
   drift apart — change it here and it changes everywhere. */

/* Sprout mark. Two leaves off a single stem, drawn on a 24-box so it scales
   cleanly to the 36px header tile and the 96px splash circle. Uses
   currentColor so the tile decides the ink. */
export function SproutMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      {/* stem — leans very slightly right so the mark isn't dead symmetric */}
      <path
        d="M11.8 21.6c-.1-4.4.1-7.6.8-10.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* right leaf — the taller one, so the mark reads as growing */}
      <path
        d="M12.2 12.6c.8-4.6 3.8-7.8 8.2-9 .4 4.8-2.8 8.4-8.2 9Z"
        fill="currentColor"
      />
      {/* left leaf — smaller and set lower, for balance not symmetry */}
      <path
        d="M11.9 15.4c-1-3.6-3.7-6-7.7-6.6-.6 3.8 2.2 6.6 7.7 6.6Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  )
}

/* Header lockup: tile + stacked wordmark. Sized for the 390px top bar — the
   splash screen draws its own, larger lockup from SproutMark directly. */
export default function BrandLogo() {
  const { L } = useLang()

  return (
    <>
      <div className="w-9 h-9 rounded-[14px] flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-green-500 to-green-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] ring-1 ring-white/15">
        <SproutMark className="w-5 h-5 text-[#f4f7ec]" />
      </div>
      {/* Hard cap so the lockup can never push the right-hand controls off the
          row. English leaves only a couple of px of slack at 390px and the
          Telugu strings are wider, so the tagline is given an ellipsis to fall
          back on — the name itself is what must always read in full. */}
      <div className="leading-tight min-w-0 max-w-[172px]">
        <span
          className="brand-wordmark text-white block whitespace-nowrap text-[15px]"
          style={{ fontWeight: 700 }}
        >
          {L('Go Grameen', 'గో గ్రామీణ్')}
        </span>
        <span
          /* Tracked-out caps, but only just: this line is the widest thing in
             the lockup, and every extra em of tracking comes straight out of
             the Login pill on the right. */
          className="text-green-300/90 block uppercase font-semibold text-[9px] tracking-[0.04em] truncate"
        >
          {L('Your Family Farmer', 'యువర్ ఫ్యామిలీ ఫార్మర్')}
        </span>
      </div>
    </>
  )
}
