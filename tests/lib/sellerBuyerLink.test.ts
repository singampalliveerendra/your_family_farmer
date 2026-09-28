import { describe, it, expect } from 'vitest'
import { hashPassword } from '@/lib/password'
import {
  LINKED_ACCOUNT_NO_PASSWORD,
  buyerProfileForSeller,
  isPasswordless,
  isSelfOrder,
  sellerRole,
} from '@/lib/sellerBuyerLink'

// The rules that let a farmer shop as a buyer without a second sign-up. The
// buyer row created for them carries no password on purpose, so `isPasswordless`
// is load-bearing twice over: the login route must never treat such a row as
// sign-in-able, and the register route uses it to decide it may adopt the row
// instead of refusing the number.

describe('isPasswordless', () => {
  // USE: the value the switch actually writes. If this ever read as "has a
  // password", signing up on that number would dead-end forever: told an
  // account exists, holding no password that opens it.
  it('recognises the row the switch creates', () => {
    expect(isPasswordless(LINKED_ACCOUNT_NO_PASSWORD)).toBe(true)
    expect(LINKED_ACCOUNT_NO_PASSWORD).toBe('')
  })

  // USE: legacy or hand-edited rows with a blank-looking hash are equally
  // unopenable, so they are adoptable too.
  it('treats absent and whitespace hashes as no password', () => {
    expect(isPasswordless(null)).toBe(true)
    expect(isPasswordless(undefined)).toBe(true)
    expect(isPasswordless('   ')).toBe(true)
  })

  // USE: the security half. A real buyer's account must never be adoptable —
  // that would be a way to take over their orders by signing up on their number.
  it('never claims a real password is missing', () => {
    expect(isPasswordless(hashPassword('hunter2'))).toBe(false)
    expect(isPasswordless('salt:hash')).toBe(false)
  })
})

describe('sellerRole', () => {
  // USE: decides which dashboard the "back" link returns to.
  it('reads the account type', () => {
    expect(sellerRole('aggregator')).toBe('aggregator')
    expect(sellerRole('farmer')).toBe('farmer')
  })

  // USE: rows created before aggregators existed have no account_type at all,
  // and every one of them is a farmer.
  it('treats a missing account type as a farmer', () => {
    expect(sellerRole(null)).toBe('farmer')
    expect(sellerRole(undefined)).toBe('farmer')
    expect(sellerRole('')).toBe('farmer')
  })
})

describe('buyerProfileForSeller', () => {
  // USE: the phone is the ONLY thing tying a seller row to a buyer row, and
  // farm profiles store it in every format the last five years produced.
  it('normalises the phone that joins the two accounts', () => {
    const a = buyerProfileForSeller({ name: 'Ravi', phone: '+91 98765 43210' })
    const b = buyerProfileForSeller({ name: 'Ravi', phone: '09876543210' })
    expect(a).toEqual({ ok: true, profile: { name: 'Ravi', phone: '9876543210' } })
    expect(b).toEqual({ ok: true, profile: { name: 'Ravi', phone: '9876543210' } })
  })

  // USE: without a usable number there is nothing to join on, and creating a
  // buyer account keyed to a bad phone would strand every order placed on it.
  it('refuses a seller with no usable phone', () => {
    for (const phone of [null, undefined, '', '12345']) {
      const r = buyerProfileForSeller({ name: 'Ravi', phone })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/phone/i)
    }
  })

  // USE: the name is only a label — a farm profile with a blank name still has
  // to be able to shop, and the buyer pages greet whatever lands here.
  it('falls back to a generic buyer name and trims the rest', () => {
    expect(buyerProfileForSeller({ name: '  ', phone: '9876543210' })).toEqual({
      ok: true,
      profile: { name: 'Buyer', phone: '9876543210' },
    })
    expect(buyerProfileForSeller({ name: '  Ravi Kumar  ', phone: '9876543210' })).toEqual({
      ok: true,
      profile: { name: 'Ravi Kumar', phone: '9876543210' },
    })
  })

  // USE: consumers_auth.name is bounded; an over-long farm name must be cut
  // here rather than failing the insert and blocking the switch entirely.
  it('caps the name at the column width', () => {
    const r = buyerProfileForSeller({ name: 'x'.repeat(200), phone: '9876543210' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.profile.name).toHaveLength(80)
  })
})

describe('isSelfOrder', () => {
  // USE: the mis-tap this guards. A seller previewing their own shop is one tap
  // from "add to cart", and the resulting order would be real — stock gone,
  // platform fee charged, an order they must approve for themselves.
  it('catches a seller ordering from their own listing', () => {
    expect(isSelfOrder('9876543210', '9876543210')).toBe(true)
  })

  // USE: farm rows hold the number in every format five years of data entry
  // produced, so a raw string comparison would let the mis-tap straight through.
  it('sees through the phone formats the farm rows are stored in', () => {
    expect(isSelfOrder('9876543210', '+919876543210')).toBe(true)
    expect(isSelfOrder('9876543210', '09876543210')).toBe(true)
    expect(isSelfOrder('+91 98765 43210', '919876543210')).toBe(true)
  })

  // USE: the feature exists so farmers can buy from EACH OTHER. Blocking a
  // genuine order between two farmers would defeat the whole thing.
  it('lets one farmer buy from another', () => {
    expect(isSelfOrder('9876543210', '9123456789')).toBe(false)
  })

  // USE: a farm row with no phone (or a broken one) must not collapse to a
  // match against a guest who also gave nothing — that would block checkout.
  it('never matches on a missing or unusable number', () => {
    expect(isSelfOrder('', '')).toBe(false)
    expect(isSelfOrder(null, null)).toBe(false)
    expect(isSelfOrder('9876543210', null)).toBe(false)
    expect(isSelfOrder(undefined, '9876543210')).toBe(false)
    expect(isSelfOrder('12345', '12345')).toBe(false)
  })
})
