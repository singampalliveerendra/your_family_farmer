'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRef, useState, type ReactNode } from 'react'

/* One product tile in a 2-column grid — the look of the consumer home grid,
 * shared with the aggregators' bulk market (2026-11-05: "the bulk market should
 * look and work like the consumer product dashboard — reuse the components").
 * Presentational only: every page decides what goes in it (retail price and a
 * cart button for households; wholesale price, minimum and an Order button for
 * aggregators). The markup is the consumer card's, moved here unchanged, so the
 * consumer grid looks exactly as before. */

// Solid pill colour for the method badge over the image (natural=green,
// organic=blue). White text sits on a solid colour so it reads over any photo.
export const METHOD_PILL: Record<string, string> = {
  natural:      'bg-green-600 text-white',
  organic:      'bg-blue-600 text-white',
  low_chemical: 'bg-amber-500 text-white',
  chemical:     'bg-red-500 text-white',
}

// Image-area background tint by produce type, used only for the emoji
// fallback (no photo). Fruits=yellow, vegetables=pink, leafy greens=green.
export const PRODUCE_BG: Record<string, string> = {
  '🍌': '#fff8e1', '🥭': '#fff8e1', '🍓': '#fff8e1', '🥥': '#fff8e1', '🍇': '#fff8e1', '🍋': '#fff8e1', // fruits
  '🍅': '#fce4ec', '🍆': '#fce4ec', '🫑': '#fce4ec', '🥕': '#fce4ec', '🌽': '#fce4ec', '🧅': '#fce4ec', '🧄': '#fce4ec', // vegetables
  '🥬': '#e8f5e9', '🥦': '#e8f5e9', '🌿': '#e8f5e9', '🫒': '#e8f5e9', // leafy greens
}
export const DEFAULT_PRODUCE_BG = '#f5f5f5'

/** The grid both pages use: two columns, equal-height rows. */
export const PRODUCE_GRID_CLASS = 'grid grid-cols-2 gap-2 auto-rows-fr'

const CHIP_TONE = {
  green: 'text-green-700 bg-green-50',
  amber: 'text-amber-800 bg-amber-50',
  gray: 'text-gray-700 bg-gray-100',
  blue: 'text-[#27486a] bg-[#e5ecf3]',
} as const
export type TileChip = { key: string; icon: string; text: string; tone: keyof typeof CHIP_TONE }

export type ProduceTileProps = {
  href: string
  name: string
  variety?: string | null
  /** "from Ramesh, Kovvur" — the grower behind an aggregator's produce. */
  growerLine?: string | null
  images: string[]
  emoji: string
  /** The method badge over the photo; null hides it. */
  method?: { className: string; label: string } | null
  priority?: boolean
  /** Top-left over the photo (the consumer card's Share button). */
  topLeft?: ReactNode
  chips?: TileChip[]
  seller?: { icon: string; text: string; href?: string; linkText?: string } | null
  /** Extra lines under the seller (distance, rating …). */
  meta?: ReactNode
  price: { main: string; unit: string }
  /** A short line right under the price (the bulk minimum, for instance). */
  priceNote?: ReactNode
  badge?: { text: string; tone: 'amber' | 'gray' } | null
  message?: string | null
  cta: ReactNode
  /** Rendered after the card body (modals that belong to this card). */
  children?: ReactNode
}

export default function ProduceTile(p: ProduceTileProps) {
  // Swipe gallery — activeImg tracks which slide is centred, for the dots.
  const [activeImg, setActiveImg] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)
  const onGalleryScroll = () => {
    const el = galleryRef.current
    if (!el) return
    setActiveImg(Math.round(el.scrollLeft / el.clientWidth))
  }
  const chips = p.chips ?? []

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex flex-col h-full">
      {/* Image — fixed 160px. Multiple photos become a swipe gallery; method
          pill top-right, dots bottom-centre. */}
      <div className="relative h-40 w-full flex-shrink-0">
        {p.images.length ? (
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          >
            {p.images.map((url, gi) => (
              <Link
                key={url}
                href={p.href}
                className="relative snap-center shrink-0 w-full h-40 block"
              >
                {/* The first row's covers load eagerly (above the fold); every
                    other photo stays lazy. */}
                <Image src={url} alt={p.name} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" priority={p.priority && gi === 0} />
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href={p.href}
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: PRODUCE_BG[p.emoji] ?? DEFAULT_PRODUCE_BG }}
          >
            <span className="text-5xl">{p.emoji}</span>
          </Link>
        )}
        {p.method && (
          <span
            className={`absolute top-2 right-2 ${p.method.className} text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm`}
          >
            {p.method.label}
          </span>
        )}
        {p.topLeft && <div className="absolute top-2 left-2">{p.topLeft}</div>}
        {p.images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {p.images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeImg ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 min-w-0">
        {/* Name + variety — single line each, ellipsis on overflow. The grower
            gets its own line: "Tomatoes — from Ramesh, Kovvur" would truncate
            to "Tomatoes — from…" in a 390px column. */}
        <Link href={p.href} className="block min-w-0">
          <h3 className="font-bold text-[15px] leading-[1.2] text-gray-900 truncate">
            {p.name}
          </h3>
          {p.variety && (
            <p className="text-[12px] text-[#666] truncate mt-0.5">{p.variety}</p>
          )}
          {p.growerLine && (
            <p className="text-[12px] font-semibold text-green-800 truncate mt-0.5">
              {p.growerLine}
            </p>
          )}
        </Link>

        {chips.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {chips.map((c) => (
              <span key={c.key} className={`inline-flex items-center gap-1 text-[11px] font-bold ${CHIP_TONE[c.tone]} rounded-full px-2 py-0.5`}>
                {c.icon} {c.text}
              </span>
            ))}
          </div>
        )}

        {/* Seller + location, with a small tappable link */}
        {p.seller && (
          <div className="flex items-center justify-between gap-1.5 mt-1">
            <p className="text-[11px] text-[#666] truncate min-w-0">
              {p.seller.icon} {p.seller.text}
            </p>
            {p.seller.href && p.seller.linkText && (
              <Link
                href={p.seller.href}
                className="flex-shrink-0 text-[11px] font-semibold text-[#1a5c2a] whitespace-nowrap active:opacity-70"
              >
                {p.seller.linkText} ›
              </Link>
            )}
          </div>
        )}

        {p.meta}

        {/* Price */}
        <div className="mt-1.5">
          <span className="font-extrabold text-[18px] text-[#1a5c2a]">
            {p.price.main}
            <span className="text-[12px] font-medium text-[#666]">/{p.price.unit}</span>
          </span>
        </div>
        {p.priceNote}

        {p.badge && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span
              className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                p.badge.tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-[#f5f5f5] text-[#666]'
              }`}
            >
              {p.badge.text}
            </span>
          </div>
        )}

        {p.message && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 leading-snug text-center mt-1.5">
            {p.message}
          </p>
        )}

        {/* CTA — pinned to bottom of card, fixed 40px height */}
        <div className="mt-auto pt-2.5">
          {p.cta}
        </div>
      </div>

      {p.children}
    </div>
  )
}

/** The search box above both grids. */
export function ProduceSearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-green-500 focus:outline-none"
      />
    </div>
  )
}

/** The scrolling chip row under the search (categories; the bulk market adds seller / state). */
export function ProduceChipRow({ chips }: { chips: { key: string; label: string; on: boolean; onClick: () => void }[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={chip.onClick}
          className={`flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${
            chip.on
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-700 border-gray-200'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
