import { describe, it, expect } from 'vitest'
import { normalizeComplaintType, COMPLAINT_TYPES, COMPLAINT_TYPE_LABEL } from '@/lib/complaints'

// The complaint vocabulary is shared by the consumer, farmer and moderator
// APIs. If the three drift apart, a complaint raised on one screen becomes
// invisible on the moderator's filter — a buyer's escalation lost silently.

describe('normalizeComplaintType', () => {
  // USE: the four known categories pass through unchanged, so the moderator's
  // filters and counts line up with what the buyer chose.
  it('keeps every known category as-is', () => {
    for (const t of COMPLAINT_TYPES) {
      expect(normalizeComplaintType(t)).toBe(t)
    }
  })

  // USE: this value arrives in a JSON body from a phone. An unknown string
  // must land in 'other' — where a moderator will still SEE it — rather than
  // be written raw and disappear from every category filter.
  it('files anything unrecognised under "other" instead of storing it raw', () => {
    expect(normalizeComplaintType('spam')).toBe('other')
    expect(normalizeComplaintType('')).toBe('other')
  })

  // USE: no input at all, or a non-string, must not throw out of the API route.
  it('defaults to "other" for missing or non-string input', () => {
    expect(normalizeComplaintType(undefined)).toBe('other')
    expect(normalizeComplaintType(null)).toBe('other')
    expect(normalizeComplaintType(42)).toBe('other')
    expect(normalizeComplaintType({})).toBe('other')
  })
})

describe('COMPLAINT_TYPE_LABEL', () => {
  // USE: every category must have a human label, or the moderator's screen
  // shows a raw database string like "quality_complaint" to the client.
  it('has a readable label for every category', () => {
    for (const t of COMPLAINT_TYPES) {
      expect(COMPLAINT_TYPE_LABEL[t]).toBeTruthy()
      expect(COMPLAINT_TYPE_LABEL[t]).not.toContain('_')
    }
  })
})
