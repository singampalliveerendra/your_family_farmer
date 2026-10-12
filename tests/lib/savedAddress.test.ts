import { describe, it, expect } from 'vitest'
import { parseAddress, addressFromRow, addressToRow, isAddressComplete, formatAddress, EMPTY_ADDRESS } from '@/lib/savedAddress'

const good = { address: 'H.No 12-3, Main Road', city: 'Guntur', landmark: 'Near temple', pincode: '522001', altPhone: '' }

describe('isAddressComplete', () => {
  // Same rule the cart enforces before it lets an order through.
  it('needs a 10+ char address, a city and a 6-digit PIN', () => {
    expect(isAddressComplete(good)).toBe(true)
    expect(isAddressComplete({ ...good, address: 'Short' })).toBe(false)
    expect(isAddressComplete({ ...good, city: '  ' })).toBe(false)
    expect(isAddressComplete({ ...good, pincode: '52200' })).toBe(false)
    expect(isAddressComplete(EMPTY_ADDRESS)).toBe(false)
  })
})

describe('parseAddress', () => {
  it('trims and accepts a complete address', () => {
    const r = parseAddress({ ...good, city: '  Guntur  ' })
    expect(r).toEqual({ ok: true, value: { ...good, city: 'Guntur' } })
  })

  // A 7-digit typo must fail, not be quietly cut to the first six digits.
  it('rejects a PIN that is not exactly 6 digits', () => {
    expect(parseAddress({ ...good, pincode: '5220011' }).ok).toBe(false)
    expect(parseAddress({ ...good, pincode: 'abcdef' }).ok).toBe(false)
  })

  it('accepts a spaced PIN', () => {
    const r = parseAddress({ ...good, pincode: '522 001' })
    expect(r.ok && r.value.pincode).toBe('522001')
  })

  // Optional alternate phone: blank is fine, +91 prefix is stripped, a
  // half-typed number is refused (a rider would dial a dead line).
  it('handles the alternate phone', () => {
    expect(parseAddress({ ...good, altPhone: '' }).ok).toBe(true)
    const r = parseAddress({ ...good, altPhone: '+91 98765 43210' })
    expect(r.ok && r.value.altPhone).toBe('9876543210')
    expect(parseAddress({ ...good, altPhone: '98765' }).ok).toBe(false)
  })

  it('caps over-long fields', () => {
    const r = parseAddress({ ...good, address: 'x'.repeat(500) })
    expect(r.ok && r.value.address.length).toBe(400)
  })

  it('refuses junk bodies', () => {
    expect(parseAddress(null).ok).toBe(false)
    expect(parseAddress({ address: 123 }).ok).toBe(false)
  })
})

describe('addressFromRow / addressToRow', () => {
  it('round-trips', () => {
    const row = addressToRow({ ...good, altPhone: '9876543210' })
    expect(addressFromRow(row)).toEqual({ ...good, altPhone: '9876543210' })
  })

  // Optional fields go to the DB as null, and come back as ''.
  it('stores blank optionals as null', () => {
    const row = addressToRow({ ...good, landmark: '' })
    expect(row.address_landmark).toBeNull()
    expect(row.address_alt_phone).toBeNull()
    expect(addressFromRow(row)?.landmark).toBe('')
  })

  // A never-saved account (all nulls) or a half row is "no saved address", so
  // the cart shows the form rather than an unusable card.
  it('returns null when nothing usable is saved', () => {
    expect(addressFromRow(null)).toBeNull()
    expect(addressFromRow({ address_line: null, address_city: null, address_pincode: null })).toBeNull()
    expect(addressFromRow({ address_line: 'H.No 12-3, Main Road', address_city: 'Guntur', address_pincode: null })).toBeNull()
  })
})

describe('formatAddress', () => {
  it('reads as one line, skipping a blank landmark', () => {
    expect(formatAddress(good)).toBe('H.No 12-3, Main Road, Near temple, Guntur – 522001')
    expect(formatAddress({ ...good, landmark: '' })).toBe('H.No 12-3, Main Road, Guntur – 522001')
  })
})
