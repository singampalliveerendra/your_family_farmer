/**
 * A buyer request ("demand intent"), checked on the server (security fix,
 * 2026-11-04). `full` = a new request (crop, name and phone required); an edit
 * may only change crop, quantity, date and location — never who asked.
 */

export type IntentFields = {
  crop_name?: string
  quantity_kg?: number | null
  needed_by_date?: string | null
  delivery_location?: string | null
  requester_name?: string
  requester_phone?: string
  region_slug?: string | null
}

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

export function parseIntent(b: Record<string, unknown>, full: boolean): { ok: true; fields: IntentFields } | { ok: false; error: string } {
  const f: IntentFields = {}
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  if (full || 'crop_name' in b) {
    const crop = str(b.crop_name, 80)
    if (!crop) return { ok: false, error: 'Enter the crop name.' }
    f.crop_name = crop
  }
  if ('quantity_kg' in b) {
    if (b.quantity_kg === null || b.quantity_kg === '') f.quantity_kg = null
    else {
      const q = Number(b.quantity_kg)
      if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) return { ok: false, error: 'Enter a sensible quantity.' }
      f.quantity_kg = Math.round(q * 1000) / 1000
    }
  }
  if ('needed_by_date' in b) {
    const d = b.needed_by_date
    if (d === null || d === '') f.needed_by_date = null
    else if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: 'Enter a valid date.' }
    else if (d < today()) return { ok: false, error: 'Needed-by date cannot be in the past.' }
    else f.needed_by_date = d
  }
  if ('delivery_location' in b) f.delivery_location = str(b.delivery_location, 200) || null
  if (full) {
    const name = str(b.requester_name, 80)
    const phone = str(b.requester_phone, 20).replace(/\D/g, '').slice(-10)
    if (!name) return { ok: false, error: 'Enter your name.' }
    if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: 'Enter a valid 10-digit mobile number.' }
    f.requester_name = name
    f.requester_phone = phone
    f.region_slug = str(b.region_slug, 60) || null
  }
  if (!full && !Object.keys(f).length) return { ok: false, error: 'Nothing to change.' }
  return { ok: true, fields: f }
}
