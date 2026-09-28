import { describe, it, expect } from 'vitest'
import {
  hasTelugu,
  matchesProduceQuery,
  matchesCategoryKeywords,
  produceNameHaystack,
  produceSearchHaystack,
} from '@/lib/produceSearch'

// Bilingual produce search (182f225). Crop names are stored however whoever
// typed them left them — "Tomato", "Tomato / టమాటా", "టమాటా", or Telugu words in
// LATIN script like "Pasupu" (f2e2e41). Search used to match the raw column, so
// a buyer typing టమాటా found nothing and the Telugu-speaking half of the
// audience could only search in a language they may not read.
//
// The fix widens the HAYSTACK rather than translating the query, and these
// tests exist to protect that choice: translating a half-typed word yields
// nothing, so partial typing is the property most easily lost.

describe('matchesProduceQuery', () => {
  // The original bug, in one line: an English-named listing found by its
  // Telugu name.
  it('finds an English-named listing by its Telugu name', () => {
    expect(matchesProduceQuery({ name: 'Tomato' }, 'టమాటా')).toBe(true)
  })

  // And the reverse, for listings a farmer entered in Telugu only.
  it('finds a Telugu-named listing by its English name', () => {
    expect(matchesProduceQuery({ name: 'టమాటా' }, 'tomato')).toBe(true)
  })

  // Why the haystack is widened instead of the query being translated: a
  // buyer types one letter at a time, and "టమా" is not a word any translator
  // would resolve. Both directions must survive partial input.
  it('still matches while the buyer is only part-way through typing', () => {
    expect(matchesProduceQuery({ name: 'Tomato' }, 'టమా')).toBe(true)
    expect(matchesProduceQuery({ name: 'టమాటా' }, 'tom')).toBe(true)
  })

  // Real listings are rarely a bare crop name. One- and two-word windows are
  // what let a crop be found inside a longer name.
  it('finds a crop buried inside a longer name', () => {
    expect(matchesProduceQuery({ name: 'Fresh Bottle Gourd' }, 'సొరకాయ')).toBe(true)
  })

  // Farmers type Telugu words in Latin script. "Pasupu" matched neither the
  // English key ("turmeric") nor a Telugu-script lookup (పసుపు) until the
  // dictionary followed one hop through the shared Telugu word.
  it('answers both languages for a name transliterated into Latin script', () => {
    expect(matchesProduceQuery({ name: 'Pasupu' }, 'turmeric')).toBe(true)
    expect(matchesProduceQuery({ name: 'Pasupu' }, 'పసుపు')).toBe(true)
  })

  // A name already carrying both sides is split so each half matches alone.
  it('matches either half of a bilingual "English / తెలుగు" name', () => {
    expect(matchesProduceQuery({ name: 'Tomato / టమాటా' }, 'టమాటా')).toBe(true)
    expect(matchesProduceQuery({ name: 'Tomato / టమాటా' }, 'tomato')).toBe(true)
  })

  // Widening the haystack must not make everything match everything.
  it('does not match an unrelated crop in either language', () => {
    expect(matchesProduceQuery({ name: 'Rice' }, 'టమాటా')).toBe(false)
    expect(matchesProduceQuery({ name: 'బియ్యం' }, 'tomato')).toBe(false)
  })

  // An empty box is not a filter, so the full list stays visible.
  it('matches everything for an empty or whitespace query', () => {
    expect(matchesProduceQuery({ name: 'Rice' }, '')).toBe(true)
    expect(matchesProduceQuery({ name: 'Rice' }, '   ')).toBe(true)
  })

  // Case and stray spaces around what the buyer typed are ignored.
  it('ignores case and surrounding whitespace in the query', () => {
    expect(matchesProduceQuery({ name: 'Tomato' }, '  TOMATO  ')).toBe(true)
  })

  // A listing with no name at all must not throw the whole search.
  it('survives a listing with missing fields', () => {
    expect(matchesProduceQuery({}, 'tomato')).toBe(false)
    expect(matchesProduceQuery({ name: null, variety: undefined }, 'tomato')).toBe(false)
  })

  // Variety is searchable too — it is part of what a buyer is looking for.
  it('searches the variety as well as the name', () => {
    expect(matchesProduceQuery({ name: 'Rice', variety: 'Sona Masoori' }, 'sona')).toBe(true)
  })
})

describe('produceNameHaystack vs produceSearchHaystack', () => {
  // The deliberate split: the free-text description IS searchable in the box,
  // but must not feed category guessing — "we grow this beside our tomatoes"
  // should never file a rice listing under tomatoes.
  it('keeps the description out of the NAME haystack', () => {
    const rice = { name: 'Rice', description: 'grown beside our tomatoes' }
    expect(produceNameHaystack(rice)).not.toContain('tomato')
    expect(produceSearchHaystack(rice)).toContain('tomato')
    expect(matchesProduceQuery(rice, 'tomato')).toBe(true)
  })
})

describe('matchesCategoryKeywords', () => {
  // Older listings have no explicit category, so it is guessed from the crop
  // name. Through the same bilingual haystack, a Telugu-named listing lands
  // under Vegetables instead of vanishing from every filter.
  it('files a Telugu-named listing under the English category keyword', () => {
    expect(matchesCategoryKeywords({ name: 'టమాటా' }, ['tomato', 'onion'])).toBe(true)
  })

  // The guess still has to be wrong for the wrong crop.
  it('does not file a listing under a category it has nothing to do with', () => {
    expect(matchesCategoryKeywords({ name: 'టమాటా' }, ['mango', 'banana'])).toBe(false)
  })
})

describe('hasTelugu', () => {
  // Used only to decide which side of the dictionary a piece of text belongs
  // on, so it needs to recognise the script and not the language.
  it('detects Telugu script, including inside a mixed string', () => {
    expect(hasTelugu('టమాటా')).toBe(true)
    expect(hasTelugu('Tomato / టమాటా')).toBe(true)
    expect(hasTelugu('Tomato')).toBe(false)
    expect(hasTelugu('')).toBe(false)
  })
})
