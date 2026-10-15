import { produceNameHaystack } from './produceSearch'
import { soundKey } from './teluguTranslit'

// Text search over an Orders page, in either language and either script.
//
// Each order is indexed ONCE (when the list loads) into three strings:
//   raw    — every field as stored plus its other-language forms, lower-cased.
//            Answers exact typing: an order code, "టమాటా", "tomato".
//   sounds — the sounds-like key of all of the above (src/lib/teluguTranslit).
//            Answers Telugu typed on an English keyboard: "tamata", "srinu".
//   digits — the phone number / order code digits, so "98765" finds a buyer
//            however the number was stored.
//
// A query matches when EVERY word in it matches one of the three. Words are
// ANDed so "ravi tomato" narrows to Ravi's tomato orders instead of widening to
// everything Ravi or anything tomato.
//
// The search only filters what the page already loaded. It never changes an
// order, a status filter or an API call.

export type OrderSearchIndex = { raw: string; sounds: string; digits: string }

// Status words a user might type, in both languages, keyed by the same buckets
// the order pages show. Kept short and literal — what is on the chips.
const STATUS_WORDS: Record<string, string[]> = {
  pending: ['pending', 'new', 'waiting', 'పెండింగ్', 'కొత్త'],
  approved: ['approved', 'confirmed', 'accepted', 'ఆమోదించారు', 'ఆమోదం', 'నిర్ధారించారు'],
  shipped: ['shipped', 'on the way', 'out for delivery', 'షిప్', 'దారిలో'],
  completed: ['completed', 'resolved', 'delivered', 'picked up', 'received', 'పూర్తయింది', 'పరిష్కరించబడింది', 'డెలివరీ', 'అందింది'],
  declined: ['declined', 'rejected', 'తిరస్కరించారు', 'తిరస్కరణ'],
  cancelled: ['cancelled', 'canceled', 'రద్దు'],
  self_pickup: ['pickup', 'self pickup', 'పికప్'],
  home_delivery: ['home delivery', 'delivery', 'హోమ్ డెలివరీ', 'డెలివరీ'],
  courier: ['courier', 'కొరియర్'],
}

type StatusFields = {
  status: string
  delivery_type?: string | null
  delivery_status?: string | null
  shipped_at?: string | null
  collected_at?: string | null
  received_at?: string | null
  delivered_at?: string | null
}

/** The bucket an order shows under, as the order pages decide it. */
export function orderBucket(o: StatusFields): 'pending' | 'approved' | 'shipped' | 'completed' | 'declined' | 'cancelled' {
  if (o.status === 'pending') return 'pending'
  if (o.status === 'declined') return 'declined'
  if (o.status === 'cancelled') return 'cancelled'
  if (o.delivery_status === 'delivered' || o.collected_at || o.received_at || o.delivered_at) return 'completed'
  if (o.shipped_at || o.delivery_status === 'picked_up' || o.delivery_status === 'out_for_delivery') return 'shipped'
  return 'approved'
}

export function orderStatusWords(o: StatusFields): string[] {
  const words = [...STATUS_WORDS[orderBucket(o)]]
  if (o.delivery_type && STATUS_WORDS[o.delivery_type]) words.push(...STATUS_WORDS[o.delivery_type])
  return words
}

/**
 * Index one order from its searchable texts. `produceNames` go through the
 * bilingual produce dictionary (so "tomato" finds a "టమాటా" order and back);
 * `texts` are indexed as written plus their sound key.
 */
export function buildOrderSearchIndex(
  texts: Array<string | null | undefined>,
  produceNames: Array<string | null | undefined> = [],
): OrderSearchIndex {
  const parts: string[] = []
  for (const t of texts) {
    const v = (t ?? '').toString().trim()
    if (v) parts.push(v.normalize('NFC'))
  }
  for (const name of produceNames) {
    const hay = produceNameHaystack({ name })
    if (hay) parts.push(hay)
  }
  const raw = parts.join(' | ').toLowerCase()
  // Sound keys per part, so one field's last word never runs into the next
  // field's first word and fakes a match.
  const sounds = ' ' + parts.map((p) => soundKey(p)).filter(Boolean).join(' | ') + ' '
  const digits = parts.map((p) => p.replace(/\D/g, '')).filter(Boolean).join(' ')
  return { raw, sounds, digits }
}

/** Shortest sound key we trust: one letter matches nearly everything. */
const MIN_SOUND_KEY = 2

function wordMatches(index: OrderSearchIndex, word: string): boolean {
  if (index.raw.includes(word)) return true

  const digits = word.replace(/\D/g, '')
  if (digits.length >= 3 && digits.length === word.length && index.digits.includes(digits)) return true

  const key = soundKey(word)
  return key.length >= MIN_SOUND_KEY && index.sounds.includes(key)
}

/**
 * Does this order answer the query? Empty query → everything matches, so the
 * page behaves exactly as before until the user types.
 */
export function matchesOrderSearch(index: OrderSearchIndex, query: string): boolean {
  const q = query.trim().normalize('NFC').toLowerCase()
  if (!q) return true
  // Drop punctuation-only tokens ("-", "/") so they can't fail the AND.
  const words = q.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (words.length === 0) return true
  return words.every((w) => wordMatches(index, w))
}

// ── Per-page field lists ───────────────────────────────────────────────────

type ConsumerSearchable = StatusFields & {
  order_code?: string | null
  produce_name?: string | null
  pickup_location?: string | null
  farmer?: { name?: string | null; village?: string | null } | null
}

/** A buyer finds an order by farmer, crop, order code, place or status. */
export function consumerOrderIndex(o: ConsumerSearchable): OrderSearchIndex {
  return buildOrderSearchIndex(
    [o.order_code, o.farmer?.name, o.farmer?.village, o.pickup_location, ...orderStatusWords(o)],
    [o.produce_name],
  )
}

type FarmerSearchable = StatusFields & {
  order_code?: string | null
  produce_name?: string | null
  buyer_name?: string | null
  buyer_phone?: string | null
  pickup_location?: string | null
}

/** A farmer / aggregator finds an order by buyer, phone, crop, code, place or status. */
export function farmerOrderIndex(o: FarmerSearchable): OrderSearchIndex {
  return buildOrderSearchIndex(
    [o.order_code, o.buyer_name, o.buyer_phone, o.pickup_location, ...orderStatusWords(o)],
    [o.produce_name],
  )
}


/** The Telugu text across a set of indexes — feeds the search box's preview. */
export function orderSearchVocabulary(indexes: Iterable<OrderSearchIndex>): string[] {
  const out: string[] = []
  for (const idx of indexes) if (/[ఀ-౿]/.test(idx.raw)) out.push(idx.raw)
  return out
}
