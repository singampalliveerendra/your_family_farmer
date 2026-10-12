// "Share my produce" — the farmer taps Share and gets one or more catalogue
// images (photo, name, price per tile) to post on WhatsApp. Everything here is
// the pure part: which listings go on the images, how they split into pages,
// the price text, and the link that travels with them. The canvas drawing
// lives in src/components/farmer/ShareProduceButton.tsx.
//
// A shared image is just pixels — tapping it on WhatsApp only zooms it, it can
// never open a website. So the link to the farmer's page goes as the share's
// caption text (tappable) and is also printed + QR-coded on every image.

import { isSoldOutWithHarvests } from './produceStatus'
import { formatQty, normalizeStep } from './saleStep'

export type ShareListing = {
  id: string
  name: string
  emoji?: string | null
  status: string
  price_tier_1_price?: number | null
  unit?: string | null
  stock_qty?: number | null
  sale_step?: number | null
  image_url?: string | null
}

// Tiles per image. 3 columns × 3 rows keeps each photo big enough to read on a
// phone at the 1080×1350 (4:5) size WhatsApp and Status show uncropped.
export const SHARE_COLS = 3
export const SHARE_PER_PAGE = 9

/**
 * The listings a buyer could actually order right now — the same rule the
 * farmer's public Produce tab uses for its buyable shelf: status 'available'
 * and not sold out once logged harvests are counted (orders decrement the
 * harvest row, not the template). Sold-out, paused, coming-soon and taken-down
 * rows stay off the image, as does anything without a price — a tile with no
 * price is no use in a catalogue.
 */
export function pickShareItems<T extends ShareListing>(
  listings: readonly T[],
  harvestsByListing: Readonly<Record<string, ReadonlyArray<{ stock_qty?: number | null }>>>,
): T[] {
  return listings.filter(
    (p) =>
      p.status === 'available' &&
      p.price_tier_1_price != null &&
      p.price_tier_1_price > 0 &&
      !isSoldOutWithHarvests(p, harvestsByListing[p.id] ?? []),
  )
}

/**
 * Split items into image pages, as evenly as possible. 10 items is two images
 * of 5, not one of 9 and a lonely second image holding 1.
 */
export function chunkForShare<T>(items: readonly T[], perPage = SHARE_PER_PAGE): T[][] {
  if (!items.length) return []
  const pages = Math.ceil(items.length / perPage)
  const base = Math.floor(items.length / pages)
  const extra = items.length % pages
  const out: T[][] = []
  let i = 0
  for (let p = 0; p < pages; p++) {
    const size = base + (p < extra ? 1 : 0)
    out.push(items.slice(i, i + size))
    i += size
  }
  return out
}

/**
 * "₹40/kg". Prices are stored per whole unit; a part-unit produce (250 g
 * mirchi) still reads per kg, with the smallest pack after it so a buyer
 * isn't surprised they can order less: "₹40/kg · min 0.25 kg".
 */
export function sharePriceLabel(item: Pick<ShareListing, 'price_tier_1_price' | 'unit' | 'sale_step'>): string {
  const unit = (item.unit || 'kg').trim()
  const price = Number(item.price_tier_1_price ?? 0)
  const base = `₹${formatQty(price)}/${unit}`
  const step = normalizeStep(item.sale_step, unit)
  return step < 1 ? `${base} · min ${formatQty(step)} ${unit}` : base
}

/** The farmer's public page — where a buyer can see and order these items. */
export function farmerShareUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, '')}/farmer/${encodeURIComponent(slug)}`
}

/** What a printed URL looks like on the image: no scheme, no www. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '')
}

type Tr = (en: string, te: string) => string

/** The caption sent with the images — its link is the tappable part. */
export function shareCaption(farmerName: string, url: string, L: Tr): string {
  const name = farmerName.trim()
  return [
    name
      ? L(`🌾 Fresh produce from ${name}'s farm`, `🌾 ${name} పొలం నుండి తాజా పంట`)
      : L('🌾 Fresh produce, straight from the farm', '🌾 పొలం నుండి నేరుగా తాజా పంట'),
    L('Order here 👇', 'ఇక్కడ ఆర్డర్ చేయండి 👇'),
    url,
  ].join('\n')
}

/** File name for page `index` (0-based) of `total`. */
export function shareFileName(slug: string, index: number, total: number): string {
  const safe = slug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'farm'
  return total > 1 ? `gogrameen-${safe}-${index + 1}-of-${total}.png` : `gogrameen-${safe}.png`
}

/**
 * A produce photo through our own image optimiser (/_next/image). Same-origin,
 * so drawing it never trips CORS or taints the canvas — a photo straight from
 * Supabase Storage can, e.g. when the browser cached it earlier from a plain
 * <img> without CORS headers. It's also resized to the tile, which matters on
 * 4G. 384 is one of Next's default image widths; others are refused with 400.
 */
export function optimizedImageUrl(src: string, width = 384): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`
}

/**
 * Whether to put the caption text in the same share as the images.
 *
 * On iPhone/iPad, WhatsApp keeps only the text when a share carries both and
 * silently drops the images — exactly the part that matters. So on iOS the
 * images go alone and the caption is copied for the farmer to paste. Android
 * attaches the text as the image caption, so it rides along there.
 */
export function shareTextWithFiles(ua: string, maxTouchPoints = 0): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  return !ios
}
