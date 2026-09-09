import { describe, it, expect } from 'vitest'
import {
  METHOD_SHORT,
  CATEGORY_LABEL,
  methodLabel,
  categoryLabel,
} from '@/lib/produceLabels'

// Telugu is the app-wide default, but a label MAP is invisible to a `>Text<`
// scan, so /consumer/produce/[id] and /consumer/harvest/[id] each kept an
// English-only copy of these maps long after every visible string was swept.
// A Telugu reader saw "Semi-org" and "Leafy Greens" on those two pages no
// matter what the toggle said. These tests exist to keep the third page from
// drifting back to a private copy.

describe('methodLabel', () => {
  // USE: the actual regression. Telugu is the DEFAULT language, so this is what
  // an ordinary buyer sees — not an opt-in path.
  it('returns Telugu for every farming method', () => {
    expect(methodLabel('natural', 'te')).toBe('సహజం')
    expect(methodLabel('organic', 'te')).toBe('సేంద్రీయ')
    expect(methodLabel('low_chemical', 'te')).toBe('సెమీ')
    expect(methodLabel('chemical', 'te')).toBe('రసాయన')
  })

  it('still returns English when English is chosen', () => {
    expect(methodLabel('natural', 'en')).toBe('Natural')
    expect(methodLabel('low_chemical', 'en')).toBe('Semi-org')
  })

  // The column is free-ish text written by whichever form created the row, so
  // casing is not guaranteed.
  it('matches regardless of the case stored in the DB', () => {
    expect(methodLabel('Natural', 'te')).toBe('సహజం')
    expect(methodLabel('LOW_CHEMICAL', 'te')).toBe('సెమీ')
  })

  // USE: a listing with no method must never render an empty pill. Falling back
  // to natural mirrors the default the farmer produce form itself writes.
  it('falls back to natural for null, undefined and unknown methods', () => {
    expect(methodLabel(null, 'te')).toBe('సహజం')
    expect(methodLabel(undefined, 'te')).toBe('సహజం')
    expect(methodLabel('biodynamic', 'te')).toBe('సహజం')
    expect(methodLabel('biodynamic', 'en')).toBe('Natural')
  })
})

describe('categoryLabel', () => {
  it('returns Telugu for every category', () => {
    expect(categoryLabel('vegetables', 'te')).toBe('కూరగాయలు')
    expect(categoryLabel('fruits', 'te')).toBe('పళ్ళు')
    expect(categoryLabel('grains', 'te')).toBe('ధాన్యాలు')
    expect(categoryLabel('leafy', 'te')).toBe('ఆకు కూరలు')
    expect(categoryLabel('spices', 'te')).toBe('మసాలాలు')
    expect(categoryLabel('other', 'te')).toBe('ఇతర')
  })

  // USE: the chip is rendered only when this returns something. Returning the
  // raw key would print "leafy" to a buyer; returning undefined hides the chip.
  it('returns undefined for missing or unknown categories', () => {
    expect(categoryLabel(null, 'te')).toBeUndefined()
    expect(categoryLabel(undefined, 'te')).toBeUndefined()
    expect(categoryLabel('', 'te')).toBeUndefined()
    expect(categoryLabel('dairy', 'te')).toBeUndefined()
  })
})

describe('label maps', () => {
  // USE: guards the whole point of the module. A method added with only an
  // English side is the exact bug this file was written to stop, and it would
  // otherwise ship silently — English text under a Telugu default.
  it('gives every entry a non-empty Telugu side that differs from English', () => {
    for (const [key, label] of Object.entries({ ...METHOD_SHORT, ...CATEGORY_LABEL })) {
      expect(label.en.trim(), `${key} has an empty English label`).not.toBe('')
      expect(label.te.trim(), `${key} has an empty Telugu label`).not.toBe('')
      expect(label.te, `${key} was never translated`).not.toBe(label.en)
    }
  })

  // The pill sits in a 390px grid column; long Telugu wraps the card, which is
  // why "సెమీ" is not the literal translation of "Semi-org".
  it('keeps the method pill short enough not to wrap the card', () => {
    for (const [key, label] of Object.entries(METHOD_SHORT)) {
      expect(label.te.length, `${key} is too long for the pill`).toBeLessThanOrEqual(10)
    }
  })

  // The /consumer filter row builds its chips from these keys.
  it('covers every category the consumer filter row offers', () => {
    for (const key of ['all', 'vegetables', 'fruits', 'grains', 'leafy', 'spices', 'other']) {
      expect(CATEGORY_LABEL[key], `filter row key "${key}" has no label`).toBeDefined()
    }
  })
})
