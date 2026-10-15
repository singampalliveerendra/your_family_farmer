import { describe, it, expect } from 'vitest'
import {
  buildOrderSearchIndex,
  matchesOrderSearch,
  consumerOrderIndex,
  farmerOrderIndex,
  orderBucket,
  orderSearchVocabulary,
} from '@/lib/orderSearch'

// Orders-page search for buyers, farmers and aggregators: either language,
// either script, Telugu typed in English letters.

const farmerOrder = (o: Record<string, unknown> = {}) => ({
  id: 'o1',
  order_code: 'YFF-4821',
  produce_name: 'టమాటా',
  buyer_name: 'శ్రీను రెడ్డి',
  buyer_phone: '9876543210',
  pickup_location: 'Bus stand',
  status: 'pending',
  ...o,
})

const consumerOrder = (o: Record<string, unknown> = {}) => ({
  id: 'c1',
  order_code: 'YFF-1001',
  produce_name: 'Tomato',
  pickup_location: null,
  status: 'approved',
  farmer: { name: 'వెంకటేశ్వర్లు', village: 'తాడేపల్లిగూడెం' },
  ...o,
})

const find = (idx: ReturnType<typeof buildOrderSearchIndex>, q: string) => matchesOrderSearch(idx, q)

describe('farmer / aggregator orders', () => {
  const idx = farmerOrderIndex(farmerOrder())

  // USE: the headline case — Telugu UI, English keyboard.
  it('finds a Telugu buyer name typed in English letters', () => {
    expect(find(idx, 'srinu')).toBe(true)
    expect(find(idx, 'sreenu')).toBe(true)
    expect(find(idx, 'reddy')).toBe(true)
  })

  it('finds the same buyer typed in Telugu', () => {
    expect(find(idx, 'శ్రీను')).toBe(true)
  })

  it('finds a Telugu crop by its English name and by Telugu typed in English', () => {
    expect(find(idx, 'tomato')).toBe(true)
    expect(find(idx, 'tamata')).toBe(true)
    expect(find(idx, 'టమా')).toBe(true)
  })

  it('finds by order code and by part of the phone number', () => {
    expect(find(idx, 'yff-4821')).toBe(true)
    expect(find(idx, '4821')).toBe(true)
    expect(find(idx, '98765')).toBe(true)
  })

  it('finds by status in either language', () => {
    expect(find(idx, 'pending')).toBe(true)
    expect(find(idx, 'పెండింగ్')).toBe(true)
    expect(find(idx, 'delivered')).toBe(false)
  })

  // USE: several words narrow the list; they never widen it.
  it('requires every word to match', () => {
    expect(find(idx, 'srinu tamata')).toBe(true)
    expect(find(idx, 'srinu bendakaya')).toBe(false)
  })

  it('does not match an unrelated word', () => {
    expect(find(idx, 'mohan')).toBe(false)
    expect(find(idx, 'బెండకాయ')).toBe(false)
  })

  // USE: one letter would match nearly every order by sound; only exact
  // text counts until the user has typed two.
  it('ignores sound matches for a single letter', () => {
    const plain = farmerOrderIndex(farmerOrder({ buyer_name: 'Ravi', produce_name: 'Okra', order_code: 'A1', pickup_location: null }))
    expect(find(plain, 'z')).toBe(false)
  })

  // USE: an empty box must leave the page exactly as it was.
  it('matches everything when the query is empty or punctuation', () => {
    expect(find(idx, '')).toBe(true)
    expect(find(idx, '   ')).toBe(true)
    expect(find(idx, ' - ')).toBe(true)
  })
})

describe('buyer orders', () => {
  const idx = consumerOrderIndex(consumerOrder())

  it('finds the farmer and village typed in English letters', () => {
    expect(find(idx, 'venkateswarlu')).toBe(true)
    expect(find(idx, 'tadepalligudem')).toBe(true)
  })

  it('finds an English crop name typed in Telugu', () => {
    expect(find(idx, 'టమాటా')).toBe(true)
  })

  it('finds by status words', () => {
    expect(find(idx, 'approved')).toBe(true)
    expect(find(idx, 'ఆమోదించారు')).toBe(true)
  })
})

describe('orderBucket', () => {
  it('matches the chips the order pages show', () => {
    expect(orderBucket({ status: 'pending' })).toBe('pending')
    expect(orderBucket({ status: 'approved' })).toBe('approved')
    expect(orderBucket({ status: 'approved', shipped_at: 'x' })).toBe('shipped')
    expect(orderBucket({ status: 'approved', delivery_status: 'out_for_delivery' })).toBe('shipped')
    expect(orderBucket({ status: 'approved', collected_at: 'x' })).toBe('completed')
    expect(orderBucket({ status: 'declined' })).toBe('declined')
    expect(orderBucket({ status: 'cancelled' })).toBe('cancelled')
  })
})

describe('orderSearchVocabulary', () => {
  it('collects only indexes that hold Telugu', () => {
    const vocab = orderSearchVocabulary([
      buildOrderSearchIndex(['Ravi']),
      buildOrderSearchIndex(['శ్రీను']),
    ])
    expect(vocab).toHaveLength(1)
    expect(vocab[0]).toContain('శ్రీను')
  })
})
