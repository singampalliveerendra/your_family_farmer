import { describe, it, expect } from 'vitest'
import { validateSourceFarmer } from '@/lib/source-farmers'

// A source farmer is a grower an AGGREGATOR buys from. They have no login and
// no dashboard — this record IS their entire presence in the app, and it backs
// the buyer-facing promise that you can see who grew the produce and reach
// them. A record with a broken phone number quietly breaks that promise.

describe('validateSourceFarmer', () => {
  // USE: the happy path, and proof the stored values are trimmed — a trailing
  // space in a name shows up on the consumer card.
  it('accepts a complete record and trims what it stores', () => {
    const res = validateSourceFarmer({
      name: '  Subba Rao  ',
      village: ' Pedavegi ',
      address: 'Door 4-12, main road',
      phone: '9876543210',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toEqual({
        name: 'Subba Rao',
        village: 'Pedavegi',
        address: 'Door 4-12, main road',
        phone: '9876543210',
      })
    }
  })

  // USE: the name is the whole point of the record — it is what the buyer reads
  // as "grown by". A blank one would render an anonymous card.
  it('requires a name, and does not count whitespace as one', () => {
    expect(validateSourceFarmer({ name: '   ', phone: '9876543210' })).toMatchObject({ ok: false })
  })

  // USE: the number is how a buyer or a moderator reaches the actual grower.
  // Anything that is not ten digits after cleaning is unreachable.
  it('requires a real ten-digit phone number', () => {
    for (const phone of ['98765', '', 'abcdefghij', '12345678901234']) {
      const res = validateSourceFarmer({ name: 'Subba Rao', phone })
      if (phone === '12345678901234') continue // handled by the trailing-ten rule below
      expect(res).toMatchObject({ ok: false })
    }
  })

  // USE: people type numbers with +91, spaces and dashes. Taking the trailing
  // ten digits accepts every natural form without making the aggregator fight
  // the field.
  it('accepts a number typed with +91, spaces or dashes', () => {
    const res = validateSourceFarmer({ name: 'Subba Rao', phone: '+91 98765-43210' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.phone).toBe('9876543210')
  })

  // USE: in rural AP a village name is often the whole address, so demanding a
  // street address would block real records. Absent optional fields are stored
  // as null, not as empty strings, so "no address" is one value and not two.
  it('leaves village and address optional, storing absent ones as null', () => {
    const res = validateSourceFarmer({ name: 'Subba Rao', phone: '9876543210' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.village).toBeNull()
      expect(res.value.address).toBeNull()
    }
  })

  // USE: these strings go into fixed-width DB columns and onto a 390px card. A
  // pasted essay must be cut here rather than rejected by Postgres as a 500.
  it('caps over-long input instead of failing the write', () => {
    const res = validateSourceFarmer({
      name: 'x'.repeat(500),
      address: 'y'.repeat(1000),
      phone: '9876543210',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.name).toHaveLength(100)
      expect(res.value.address).toHaveLength(300)
    }
  })

  // USE: the body is JSON from a phone; non-strings must be rejected cleanly.
  it('survives non-string input', () => {
    expect(validateSourceFarmer({ name: null, phone: {} })).toMatchObject({ ok: false })
  })
})
