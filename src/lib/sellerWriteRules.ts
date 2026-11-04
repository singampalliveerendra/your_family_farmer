/**
 * The rules for what a seller (farmer or aggregator) may change, now that
 * every write to produce_listings, harvests, farmers and media goes through a
 * server route that checks the login (security fix, 2026-11-04). Before this,
 * the browser wrote those tables directly with the public key, so ANYONE could
 * change ANY row. Pure — the routes use these, and the tests pin them.
 */

// ── Produce listings ────────────────────────────────────────────────

/** Never set by a seller: ownership, bookkeeping, and numbers buyers trust. */
export const PROTECTED_LISTING_KEYS = new Set([
  'id', 'farmer_id', 'created_at', 'updated_at',
  'rating_avg', 'review_count', 'purchase_count', 'buyer_count',
])

/** Statuses a seller may put a listing into themselves. */
export const SELLER_STATUSES = ['available', 'coming_soon', 'sold_out', 'paused', 'suspended_by_farmer'] as const

/**
 * Statuses only a moderator (or the subscription hold) sets — a seller can
 * neither put a listing into them nor take it out of them. 'suspended' is the
 * moderator takedown and the expired-plan hold; 'pending_review' / 'rejected'
 * are review states.
 */
export const LOCKED_STATUSES = ['suspended', 'pending_review', 'rejected'] as const

export type StatusCheck = { ok: true } | { ok: false; error: { en: string; te: string } }

export function checkSellerStatusChange(current: string | null | undefined, next: unknown): StatusCheck {
  // Not changing it (or re-sending the same value with an edit) is always fine.
  if (next === undefined || (current != null && next === current)) return { ok: true }
  if (typeof next !== 'string' || !(SELLER_STATUSES as readonly string[]).includes(next)) {
    return { ok: false, error: { en: 'That status cannot be set here.', te: 'ఈ స్థితిని ఇక్కడ పెట్టలేరు.' } }
  }
  if (current && (LOCKED_STATUSES as readonly string[]).includes(current) && current !== next) {
    return {
      ok: false,
      error: {
        en: 'This produce was taken down by Go Grameen. Please contact your moderator.',
        te: 'ఈ ఉత్పత్తిని గో గ్రామీణ్ తీసివేసింది. దయచేసి మీ మోడరేటర్‌ను సంప్రదించండి.',
      },
    }
  }
  return { ok: true }
}

/** A seller's payload without the keys they may never set. */
export function sellerListingPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) if (!PROTECTED_LISTING_KEYS.has(k)) out[k] = v
  return out
}

// ── Harvests ────────────────────────────────────────────────────────

export const MAX_HARVEST_QTY = 9_999_999.999

const qty = (v: unknown): number | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > MAX_HARVEST_QTY) return 'bad'
  return Math.round(n * 1000) / 1000
}

/** A harvest time: a real date, not more than a year back or 60 days ahead. */
function when(v: unknown, now: Date): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  const t = d.getTime()
  if (!Number.isFinite(t)) return null
  if (t < now.getTime() - 366 * 86_400_000 || t > now.getTime() + 60 * 86_400_000) return null
  return d.toISOString()
}

export type HarvestFields = { harvested_at: string; approx_quantity: number | null; stock_qty: number | null; unit: string | null }

const HARVEST_DATE_ERR = { en: 'Pick a valid harvest date & time.', te: 'సరైన కోత తేదీ & సమయం ఎంచుకోండి.' }
const HARVEST_QTY_ERR = { en: 'Quantity must be a number, 0 or more.', te: 'పరిమాణం 0 లేదా అంతకంటే ఎక్కువ సంఖ్య ఉండాలి.' }

/**
 * A new harvest. The quantity entered IS the harvest's sellable stock (each
 * harvest is its own product with its own inventory) — the same rule the
 * harvest manager always used.
 */
export function parseHarvestCreate(body: Record<string, unknown>, now: Date = new Date()):
  { ok: true; fields: HarvestFields } | { ok: false; error: { en: string; te: string } } {
  const at = when(body.harvested_at, now)
  if (!at) return { ok: false, error: HARVEST_DATE_ERR }
  const q = qty(body.approx_quantity)
  if (q === 'bad') return { ok: false, error: HARVEST_QTY_ERR }
  const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim().slice(0, 20) : null
  return { ok: true, fields: { harvested_at: at, approx_quantity: q, stock_qty: q, unit } }
}

/** An edit: time and quantity (which resets stock), or pause / resume. Nothing else. */
export function parseHarvestPatch(body: Record<string, unknown>, now: Date = new Date()):
  { ok: true; fields: Partial<HarvestFields> & { paused?: boolean } } | { ok: false; error: { en: string; te: string } } {
  const fields: Partial<HarvestFields> & { paused?: boolean } = {}
  if ('paused' in body) {
    if (typeof body.paused !== 'boolean') return { ok: false, error: { en: 'Invalid request.', te: 'చెల్లని అభ్యర్థన.' } }
    fields.paused = body.paused
  }
  if ('harvested_at' in body) {
    const at = when(body.harvested_at, now)
    if (!at) return { ok: false, error: HARVEST_DATE_ERR }
    fields.harvested_at = at
  }
  if ('approx_quantity' in body) {
    const q = qty(body.approx_quantity)
    if (q === 'bad') return { ok: false, error: HARVEST_QTY_ERR }
    fields.approx_quantity = q
    fields.stock_qty = q
  }
  if (!Object.keys(fields).length) return { ok: false, error: { en: 'Nothing to change.', te: 'మార్చడానికి ఏమీ లేదు.' } }
  return { ok: true, fields }
}

// ── The seller's own profile ────────────────────────────────────────

/**
 * Profile columns a seller may edit on their OWN row (the route pins the row
 * to the logged-in seller). NOT here: status and approval flags, account type,
 * ratings / counts, passwords and codes, bank details (they go through
 * /api/farmer/payout-details), and the old UPI ID / QR — removed 2026-11-04:
 * payments come in through Cashfree and weekly payouts go to the bank details
 * in Payout details.
 */
export const SELLER_PROFILE_COLUMNS = [
  'name', 'slug', 'phone', 'village', 'district', 'state', 'method', 'farm_size_acres', 'farming_since_year', 'story_quote', 'story_quote_te',
  'soil_organic_carbon', 'soil_ph', 'brix_reading', 'water_source', 'delivery_available', 'pickup_available', 'farm_visit_day',
  'pickup_locations', 'pickup_slots', 'pickup_location_phones', 'cover_photo_url', 'photo_url', 'pesticide_cert_url',
  'lat', 'lng', 'location_name', 'cod_enabled', 'farm_address', 'facebook_url', 'instagram_url', 'youtube_url',
  'contact_person', 'how_we_aggregate', 'business_cert_url', 'organic_certificate_url',
] as const

/** Keep only editable profile columns; report what was refused (for tests / logs). */
export function sellerProfilePatch(body: Record<string, unknown>): { patch: Record<string, unknown>; refused: string[] } {
  const allowed = new Set<string>(SELLER_PROFILE_COLUMNS)
  const patch: Record<string, unknown> = {}
  const refused: string[] = []
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) patch[k] = v
    else refused.push(k)
  }
  return { patch, refused }
}

// ── Photos (farm-images storage) ────────────────────────────────────

export const UPLOAD_KINDS = ['profile', 'cover', 'produce', 'gallery', 'certificate'] as const
export type UploadKind = (typeof UPLOAD_KINDS)[number]
export const UPLOAD_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const

/**
 * The storage path for one upload, inside a folder the SERVER chose for the
 * caller — the seller's own `<farmerId>/`, or a moderator's
 * `onboarding/<moderatorId>/` while they set up a farmer who has no account
 * yet. The signed upload link is good for exactly that one path, so nobody can
 * write into (or over) another farmer's photos.
 */
export function uploadPath(folder: string, kind: unknown, ext: unknown, now: number = Date.now(), rand: string = Math.random().toString(36).slice(2, 8)):
  { ok: true; path: string; contentType: string } | { ok: false; error: string } {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  if (!new RegExp(`^(${uuid}|onboarding/${uuid})$`, 'i').test(folder)) return { ok: false, error: 'Invalid owner.' }
  if (typeof kind !== 'string' || !(UPLOAD_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Invalid photo type.' }
  const e = typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : ''
  if (!(UPLOAD_EXTS as readonly string[]).includes(e)) return { ok: false, error: 'Only photos can be uploaded (JPG, PNG, WebP or HEIC).' }
  const contentType = e === 'jpg' || e === 'jpeg' ? 'image/jpeg' : `image/${e}`
  return { ok: true, path: `${folder}/${kind}-${now}-${rand}.${e === 'jpeg' ? 'jpg' : e}`, contentType }
}

/** Largest photo the bucket accepts (the dashboards compress well below this). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
