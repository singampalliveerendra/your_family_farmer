import { describe, it, expect } from 'vitest'
import { growerLine } from '@/lib/source-farmers'

describe('growerLine', () => {
  it('names the grower and their village on an aggregator listing', () => {
    expect(growerLine('aggregator', { name: ' Ramesh ', village: 'Pentapadu' }))
      .toEqual({ name: 'Ramesh', village: 'Pentapadu' })
  })

  it('keeps the name when the village is missing or blank', () => {
    expect(growerLine('aggregator', { name: 'Ramesh', village: null }))
      .toEqual({ name: 'Ramesh', village: null })
    expect(growerLine('aggregator', { name: 'Ramesh', village: '  ' }))
      .toEqual({ name: 'Ramesh', village: null })
  })

  it('shows nothing when the aggregator listing has no attributed farmer', () => {
    expect(growerLine('aggregator', null)).toBeNull()
    expect(growerLine('aggregator', undefined)).toBeNull()
    expect(growerLine('aggregator', { name: '', village: 'Pentapadu' })).toBeNull()
  })

  // A farmer selling their own produce is the grower — no second line.
  it('shows nothing for a farmer selling their own produce', () => {
    expect(growerLine('farmer', { name: 'Ramesh', village: 'Pentapadu' })).toBeNull()
    expect(growerLine(null, { name: 'Ramesh', village: 'Pentapadu' })).toBeNull()
  })
})
