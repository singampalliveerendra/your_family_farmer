import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'

// Phone numbers are the account key for farmers, buyers, riders and
// moderators. Two spellings of one number must resolve to one account.

describe('normalizePhone', () => {
  it('reduces every common Indian spelling to the same ten digits', () => {
    for (const raw of [
      '9876543210', '+919876543210', '919876543210', '09876543210',
      '+91 98765 43210', '98765-43210', ' 9876543210 ', '+91-9876543210',
    ]) {
      expect(normalizePhone(raw)).toBe('9876543210')
    }
  })

  it('returns empty for anything that is not a ten-digit number', () => {
    for (const raw of ['', null, undefined, '12345', 'not a phone', '+91', '98765 4321']) {
      expect(normalizePhone(raw)).toBe('')
    }
  })

  it('keeps the trailing ten digits of an over-long string', () => {
    expect(normalizePhone('00919876543210')).toBe('9876543210')
  })
})
