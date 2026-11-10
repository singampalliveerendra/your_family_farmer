// "Share my produce" — the farmer taps Share and gets one or more catalogue
// images (photo, name, price per tile) to post on WhatsApp. Everything here is
// the pure part: which listings go on the images, how they split into pages,
// the price text, and the link that travels with them. The canvas drawing
// lives in src/components/farmer/ShareProduceButton.tsx.
//
// A shared image is just pixels — tapping it on WhatsApp only zooms it, it can
// never open a website. So the link to the farmer's page goes as the share's
// caption text (tappable) and is also printed + QR-coded on every image.

import { packPriceTag } from '@/lib/packPricing'
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
  /** Sold in packs (2026-11-10): the tile reads "₹25/250 g pack". */
  retail_pack_size?: number | string | null
  retail_pack_price?: number | string | null
}

// Tiles per image: 3 columns × 4 rows at the 1080×1350 (4:5) size WhatsApp and
// Status show uncropped. 12 (not 9) so a 90-item catalogue makes 8 images and
// fits in ONE share — Chrome refuses more than 10 files per share.
export const SHARE_COLS = 3
export const SHARE_PER_PAGE = 12

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
export function sharePriceLabel(item: Pick<ShareListing, 'price_tier_1_price' | 'unit' | 'sale_step'> & Partial<Pick<ShareListing, 'retail_pack_size' | 'retail_pack_price'>>): string {
  const tag = packPriceTag(item)
  if (tag) return `₹${formatQty(tag.price)}/${tag.pack} pack`
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
 * Where to fetch one produce photo for the share image, in the order to try.
 *
 * Straight from Supabase Storage, never through Next's image endpoint: it
 * still runs Vercel's paid image optimiser even with `images.unoptimized`
 * (checked on gogrameen.in 2026-11-09 — a 2 MB photo came back resized to
 * 45 KB), and each new photo shared was one billed transformation.
 * Supabase sends `Access-Control-Allow-Origin: *`, so the canvas can draw the
 * file. The cache-busted second try covers a copy the browser cached without
 * CORS, which would otherwise taint the canvas.
 */
export function sharePhotoUrls(src: string, now: number = Date.now()): [string, string] {
  return [src, `${src}${src.includes('?') ? '&' : '?'}share=${now}`]
}

/** Longest side of a photo once shrunk for a share tile — sharp at the ~330px
 * tile after the cover crop, light enough that 90 photos fit in phone memory. */
export const SHARE_PHOTO_MAX_PX = 640

/** Size to shrink a w×h photo to so its longest side is at most maxPx (never
 * enlarged, never below 1px). */
export function shrinkSize(w: number, h: number, maxPx: number = SHARE_PHOTO_MAX_PX): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 1, h: 1 }
  const scale = Math.min(1, maxPx / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
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

/**
 * Chrome (Android and desktop) refuses a share with more than 10 files or more
 * than 50 MB in total. It throws NotAllowedError "Permission denied", and
 * canShare() does NOT check either limit, so the Share button shows and then
 * fails. An aggregator with 90+ products gets 11+ images, so they go out in
 * batches, each from its own tap (share() needs a fresh tap every time).
 * The byte cap keeps headroom under Chrome's 50 MB.
 */
export const SHARE_MAX_FILES = 10
export const SHARE_MAX_BYTES = 45 * 1024 * 1024

/**
 * Split files (given by their sizes in bytes) into share batches, in order.
 * Returns the indexes in each batch. A single file over the byte cap still
 * gets a batch of its own: the browser can refuse it, but we don't drop it.
 */
export function shareBatches(
  sizes: readonly number[],
  maxFiles = SHARE_MAX_FILES,
  maxBytes = SHARE_MAX_BYTES,
): number[][] {
  const out: number[][] = []
  let batch: number[] = []
  let bytes = 0
  sizes.forEach((size, i) => {
    if (batch.length > 0 && (batch.length >= maxFiles || bytes + size > maxBytes)) {
      out.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(i)
    bytes += size
  })
  if (batch.length) out.push(batch)
  return out
}

/** The button for one batch: "Share images 1–10", or "Share image 11" for one. */
export function shareBatchLabel(batch: readonly number[], L: Tr): string {
  if (batch.length === 0) return ''
  const first = batch[0] + 1
  const last = batch[batch.length - 1] + 1
  return first === last
    ? L(`Share image ${first}`, `చిత్రం ${first} పంపండి`)
    : L(`Share images ${first}–${last}`, `చిత్రాలు ${first}–${last} పంపండి`)
}
