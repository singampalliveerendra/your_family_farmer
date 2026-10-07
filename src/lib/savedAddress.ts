// A buyer's one saved delivery address (consumers_auth.address_*), edited on
// /consumer/profile and pre-selected in the cart for home delivery.
//
// The rules here are the cart's own address rules — full address of at least
// 10 characters, a city, a 6-digit PIN, and an alternate phone that is either
// blank or a full 10 digits — so an address that saves on the profile page is
// always one the cart will accept, and vice versa.

export type SavedAddress = {
  address: string
  city: string
  landmark: string
  pincode: string
  altPhone: string
}

export const EMPTY_ADDRESS: SavedAddress = { address: '', city: '', landmark: '', pincode: '', altPhone: '' }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Last 10 digits of whatever was typed (+91, spaces, dashes all dropped).
const phoneDigits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '').slice(-10) : '')

export function isAddressComplete(a: SavedAddress): boolean {
  return a.address.trim().length >= 10 && a.city.trim().length > 0 && /^\d{6}$/.test(a.pincode.trim())
}

// Validates and normalises an address from an untrusted body.
export function parseAddress(input: unknown):
  | { ok: true; value: SavedAddress }
  | { ok: false; error: string } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const rawAlt = typeof b.altPhone === 'string' ? b.altPhone.replace(/\D/g, '') : ''
  const value: SavedAddress = {
    address: str(b.address, 400),
    city: str(b.city, 100),
    landmark: str(b.landmark, 200),
    // Digits only, NOT truncated — a 7-digit typo must fail, not be cut to 6.
    pincode: typeof b.pincode === 'string' ? b.pincode.replace(/\D/g, '') : '',
    altPhone: phoneDigits(b.altPhone),
  }
  if (!isAddressComplete(value)) {
    return { ok: false, error: 'Please fill the full address, city/town and a valid 6-digit pincode.' }
  }
  if (rawAlt.length > 0 && rawAlt.length < 10) {
    return { ok: false, error: 'Alternate phone must be 10 digits, or leave it blank.' }
  }
  return { ok: true, value }
}

type AddressRow = {
  address_line?: string | null
  address_city?: string | null
  address_landmark?: string | null
  address_pincode?: string | null
  address_alt_phone?: string | null
}

// consumers_auth row → SavedAddress, or null when nothing usable is saved.
export function addressFromRow(row: AddressRow | null | undefined): SavedAddress | null {
  if (!row) return null
  const a: SavedAddress = {
    address: row.address_line ?? '',
    city: row.address_city ?? '',
    landmark: row.address_landmark ?? '',
    pincode: row.address_pincode ?? '',
    altPhone: row.address_alt_phone ?? '',
  }
  return isAddressComplete(a) ? a : null
}

export function addressToRow(a: SavedAddress) {
  return {
    address_line: a.address,
    address_city: a.city,
    address_landmark: a.landmark || null,
    address_pincode: a.pincode,
    address_alt_phone: a.altPhone || null,
    address_updated_at: new Date().toISOString(),
  }
}

// "H.No 12-3, Main Road, Near the temple, Guntur – 522001"
export function formatAddress(a: SavedAddress): string {
  const parts = [a.address, a.landmark].map((s) => s.trim()).filter(Boolean)
  return `${parts.join(', ')}, ${a.city.trim()} – ${a.pincode.trim()}`
}
