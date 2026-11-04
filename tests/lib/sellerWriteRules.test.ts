import { describe, it, expect } from 'vitest'
import {
  checkSellerStatusChange, sellerListingPayload, parseHarvestCreate, parseHarvestPatch,
  sellerProfilePatch, SELLER_PROFILE_COLUMNS, uploadPath, MAX_UPLOAD_BYTES,
} from '@/lib/sellerWriteRules'
import { parseIntent } from '@/lib/demandIntent'
import { FARMER_HIDDEN_COLUMNS, FARMER_PUBLIC_COLUMNS, FARMER_SELF_COLUMNS } from '@/lib/farmerColumns'

// The rules behind the security fix (2026-11-05): what a seller may change
// once every write goes through a login-checked server route.

const NOW = new Date('2026-11-05T06:00:00Z')
const F = '11111111-1111-4111-8111-111111111111'

describe('listing status a seller may set', () => {
  it('allows the seller statuses and leaving the field alone', () => {
    expect(checkSellerStatusChange('available', undefined).ok).toBe(true)
    for (const s of ['available', 'coming_soon', 'sold_out', 'paused', 'suspended_by_farmer']) {
      expect(checkSellerStatusChange('paused', s).ok).toBe(true)
    }
  })
  it('refuses moderator-only statuses', () => {
    for (const s of ['suspended', 'pending_review', 'rejected', 'anything', 3]) {
      expect(checkSellerStatusChange('available', s).ok).toBe(false)
    }
  })
  it('a taken-down listing cannot be put back by the seller', () => {
    expect(checkSellerStatusChange('suspended', 'available').ok).toBe(false)
    expect(checkSellerStatusChange('rejected', 'paused').ok).toBe(false)
  })
  it('re-sending the same (locked) status with an edit is fine', () => {
    expect(checkSellerStatusChange('suspended', 'suspended').ok).toBe(true)
  })
})

describe('listing payload', () => {
  it('drops ownership and the numbers buyers trust', () => {
    const out = sellerListingPayload({ name: 'Tomato', farmer_id: 'x', id: 'y', rating_avg: 5, review_count: 99, purchase_count: 1, buyer_count: 1, created_at: 'z', price_tier_1_price: 40 })
    expect(out).toEqual({ name: 'Tomato', price_tier_1_price: 40 })
  })
})

describe('harvests', () => {
  it('a new harvest: quantity becomes its stock', () => {
    const r = parseHarvestCreate({ harvested_at: '2026-11-05T05:00:00Z', approx_quantity: '12.5', unit: ' kg ' }, NOW)
    expect(r).toEqual({ ok: true, fields: { harvested_at: '2026-11-05T05:00:00.000Z', approx_quantity: 12.5, stock_qty: 12.5, unit: 'kg' } })
  })
  it('refuses bad dates and quantities', () => {
    expect(parseHarvestCreate({ harvested_at: 'nope' }, NOW).ok).toBe(false)
    expect(parseHarvestCreate({ harvested_at: '2024-01-01T00:00:00Z' }, NOW).ok).toBe(false) // > a year back
    expect(parseHarvestCreate({ harvested_at: '2027-03-01T00:00:00Z' }, NOW).ok).toBe(false) // > 60 days ahead
    expect(parseHarvestCreate({ harvested_at: '2026-11-05T05:00:00Z', approx_quantity: -1 }, NOW).ok).toBe(false)
    expect(parseHarvestCreate({ harvested_at: '2026-11-05T05:00:00Z', approx_quantity: 'abc' }, NOW).ok).toBe(false)
  })
  it('an edit changes only pause, time and quantity', () => {
    expect(parseHarvestPatch({ paused: true, farmer_id: 'x', produce_listing_id: 'y' }, NOW)).toEqual({ ok: true, fields: { paused: true } })
    expect(parseHarvestPatch({ approx_quantity: 3 }, NOW)).toEqual({ ok: true, fields: { approx_quantity: 3, stock_qty: 3 } })
    expect(parseHarvestPatch({ paused: 'yes' }, NOW).ok).toBe(false)
    expect(parseHarvestPatch({ farmer_id: 'x' }, NOW).ok).toBe(false) // nothing allowed to change
  })
})

describe('own profile', () => {
  it('keeps profile fields, refuses status, money and secrets', () => {
    const { patch, refused } = sellerProfilePatch({
      name: 'Ravi', village: 'Pentapadu', phone: '9876543210',
      upi_id: 'x@upi', upi_qr_code_url: 'u', active: true, approval_status: 'approved', account_type: 'aggregator',
      password_hash: 'h', bank_account_number: '1', rating_avg: 5, region_slug: 'other',
    })
    expect(patch).toEqual({ name: 'Ravi', village: 'Pentapadu', phone: '9876543210' })
    expect(refused.sort()).toEqual(['account_type', 'active', 'approval_status', 'bank_account_number', 'password_hash', 'rating_avg', 'region_slug', 'upi_id', 'upi_qr_code_url'])
  })
  it('the old UPI ID / QR is gone from the editable list (payouts via Cashfree + bank details)', () => {
    expect(SELLER_PROFILE_COLUMNS as readonly string[]).not.toContain('upi_id')
    expect(SELLER_PROFILE_COLUMNS as readonly string[]).not.toContain('upi_qr_code_url')
  })
})

describe('farmer columns', () => {
  const cols = (s: string) => s.split(',').map((c) => c.trim())
  it('the public list has none of the hidden fields', () => {
    for (const h of FARMER_HIDDEN_COLUMNS) expect(cols(FARMER_PUBLIC_COLUMNS)).not.toContain(h)
  })
  it("the seller's own list = public + hidden, minus the old UPI fields", () => {
    const self = cols(FARMER_SELF_COLUMNS)
    expect(self).toEqual(expect.arrayContaining(cols(FARMER_PUBLIC_COLUMNS)))
    expect(self).toEqual(expect.arrayContaining(['phone', 'farm_address', 'lat', 'lng', 'pickup_location_phones']))
    expect(self).not.toContain('upi_id')
  })
})

describe('photo upload path', () => {
  it('goes into the folder the server chose', () => {
    expect(uploadPath(F, 'produce', 'JPEG', 1, 'abc')).toEqual({ ok: true, path: `${F}/produce-1-abc.jpg`, contentType: 'image/jpeg' })
    expect(uploadPath(`onboarding/${F}`, 'profile', 'png', 1, 'abc')).toEqual({ ok: true, path: `onboarding/${F}/profile-1-abc.png`, contentType: 'image/png' })
  })
  it('refuses other folders, kinds and file types', () => {
    expect(uploadPath('../etc', 'produce', 'jpg').ok).toBe(false)
    expect(uploadPath(`${F}/../x`, 'produce', 'jpg').ok).toBe(false)
    expect(uploadPath(F, 'payment-proof', 'jpg').ok).toBe(false)
    for (const e of ['pdf', 'svg', 'html', 'exe', '']) expect(uploadPath(F, 'produce', e).ok).toBe(false)
  })
  it('8 MB limit matches the bucket setting', () => {
    expect(MAX_UPLOAD_BYTES).toBe(8388608)
  })
})

describe('buyer requests (demand intents)', () => {
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  it('a new request needs crop, name and a valid phone', () => {
    expect(parseIntent({ crop_name: 'Mango', requester_name: 'Sita', requester_phone: '+91 98765 43210', needed_by_date: tomorrow, quantity_kg: '5' }, true))
      .toEqual({ ok: true, fields: { crop_name: 'Mango', quantity_kg: 5, needed_by_date: tomorrow, requester_name: 'Sita', requester_phone: '9876543210', region_slug: null } })
    expect(parseIntent({ crop_name: 'Mango', requester_name: 'Sita', requester_phone: '12345' }, true).ok).toBe(false)
    expect(parseIntent({ requester_name: 'Sita', requester_phone: '9876543210' }, true).ok).toBe(false)
  })
  it('an edit cannot change who asked', () => {
    const r = parseIntent({ quantity_kg: 2, requester_phone: '9000000000', requester_name: 'X', consumer_id: 'y' }, false)
    expect(r).toEqual({ ok: true, fields: { quantity_kg: 2 } })
  })
  it('refuses past dates and silly quantities', () => {
    expect(parseIntent({ needed_by_date: '2020-01-01' }, false).ok).toBe(false)
    expect(parseIntent({ quantity_kg: 0 }, false).ok).toBe(false)
    expect(parseIntent({}, false).ok).toBe(false)
  })
})
