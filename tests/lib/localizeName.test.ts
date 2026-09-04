import { describe, it, expect } from 'vitest'
import { localizeName, localizeUnit } from '@/lib/localizeName'

// What the buyer actually reads on a card once Telugu became the default
// (f2e2e41). From a real staging listing: "Pesalu", "Pasupu" and "Boppayi" sat
// in English on cards where every other word was Telugu, because farmers type
// Telugu words in LATIN script and the dictionary was keyed on English only.
//
// The rule these tests protect: half-guessing a product name is WORSE than
// leaving it as the farmer wrote it. A qualifier the dictionary does not know
// must survive.

describe('localizeName', () => {
  // Nothing to show rather than the string "null" on a card.
  it('is empty for a missing name', () => {
    expect(localizeName(null, 'te')).toBe('')
    expect(localizeName(undefined, 'en')).toBe('')
  })

  // The stored-bilingual form: show only the side matching the toggle.
  it('shows the matching side of an "English / తెలుగు" name', () => {
    expect(localizeName('Tomato / టమాటా', 'te')).toBe('టమాటా')
    expect(localizeName('Tomato / టమాటా', 'en')).toBe('Tomato')
  })

  // A half-filled bilingual name still has to render something.
  it('falls back to the other side when one half is blank', () => {
    expect(localizeName('Tomato / ', 'te')).toBe('Tomato')
    expect(localizeName(' / టమాటా', 'en')).toBe('టమాటా')
  })

  // In English nothing is translated: the stored text is what the farmer typed.
  it('leaves the name alone in English', () => {
    expect(localizeName('Tomato', 'en')).toBe('Tomato')
    expect(localizeName('Pasupu', 'en')).toBe('Pasupu')
  })

  // The dictionary covers the common crops for English-only rows.
  it('translates a known crop when Telugu is on', () => {
    expect(localizeName('Tomato', 'te')).toBe('టమాటా')
  })

  // The f2e2e41 fix itself: a Telugu word typed in Latin script.
  it('translates a Telugu name written in Latin script', () => {
    expect(localizeName('Pasupu', 'te')).toBe('పసుపు')
  })

  // A brand or a crop nobody has added yet is left exactly as written.
  it('leaves an unknown name untouched rather than guessing', () => {
    expect(localizeName('Widget', 'te')).toBe('Widget')
  })

  // One product written twice, once per language — a common way the produce
  // form gets filled in. Both segments resolve to the same Telugu, so the
  // duplicate collapses instead of reading "ఆవు నెయ్యి - ఆవు నెయ్యి".
  it('collapses a name written once in each language', () => {
    expect(localizeName('Aavu Neyyi - Cow ghee', 'te')).toBe('ఆవు నెయ్యి')
  })

  // The important half of that rule: a qualifier the dictionary does not know
  // is PRESERVED. Dropping it would silently change what is being sold.
  it('keeps a qualifier it cannot translate', () => {
    expect(localizeName('Tomato - Country', 'te')).toBe('టమాటా - Country')
  })

  // When nothing in the name resolves, the whole thing comes back as typed.
  it('returns a name it understands no part of completely untouched', () => {
    expect(localizeName('Bahuroopi Rice - Single Polish', 'te'))
      .toBe('Bahuroopi Rice - Single Polish')
  })
})

// localizeUnit is the other half of the preview fix (5d2a176): the farmer's
// buyer-preview hardcoded "/kg" and "kg left", so a listing sold in grams
// previewed as "₹5/kg · 4 kg left" — the one number a farmer prices against.
describe('localizeUnit', () => {
  // The units the produce form offers, which used to stay English under a
  // Telugu crop name.
  it('translates the units the form offers', () => {
    expect(localizeUnit('kg', 'te')).toBe('కేజీ')
    expect(localizeUnit('gram', 'te')).toBe('గ్రా')
    expect(localizeUnit('quintal', 'te')).toBe('క్వింటాల్')
  })

  // Stored units are not normalised, so lookup must not care about casing or
  // stray spaces from the form.
  it('is case-insensitive and trims what was stored', () => {
    expect(localizeUnit('KG', 'te')).toBe('కేజీ')
    expect(localizeUnit('  kg  ', 'te')).toBe('కేజీ')
  })

  // An unusual unit a farmer typed themselves is shown as they wrote it.
  it('leaves an unknown unit unchanged', () => {
    expect(localizeUnit('sack', 'te')).toBe('sack')
  })

  // English shows the stored text, and a missing unit shows nothing at all —
  // never the literal "undefined" beside a price.
  it('passes the unit through in English, and is empty when absent', () => {
    expect(localizeUnit('kg', 'en')).toBe('kg')
    expect(localizeUnit(null, 'te')).toBe('')
    expect(localizeUnit(undefined, 'en')).toBe('')
  })
})
