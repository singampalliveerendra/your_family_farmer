import { describe, it, expect } from 'vitest'
import { teluguToLatin, phoneticKey, soundKey, latinToTeluguPreview, teluguPreview } from '@/lib/teluguTranslit'

// A Telugu user on an English keyboard types Telugu words in English letters,
// spelled however they learned to. Search matches by SOUND: both the stored
// Telugu and the typed letters are reduced to the same key. These cases are
// the spellings real users type — each pair must meet.

describe('teluguToLatin', () => {
  it('reads consonants with their inherent and written vowels', () => {
    expect(teluguToLatin('టమాటా')).toBe('tamaataa')
    expect(teluguToLatin('శ్రీను')).toBe('shriinu')
    expect(teluguToLatin('మోహన్')).toBe('mohan')
  })

  it('reads the nasal dot as m at a word end or before p/b/m, n elsewhere', () => {
    expect(teluguToLatin('భీమవరం')).toBe('bhiimavaram')
    expect(teluguToLatin('సంపత్')).toBe('sampat')
    expect(teluguToLatin('రంగయ్య')).toBe('rangayya')
  })

  // USE: "ఆర్డర్‌" carries a zero-width non-joiner; left in, it splits the word.
  it('drops zero-width joiners and converts Telugu digits', () => {
    expect(teluguToLatin('ఆర్డర్‌')).toBe('aardar')
    expect(teluguToLatin('౧౨౩')).toBe('123')
  })

  it('passes English through untouched', () => {
    expect(teluguToLatin('Tomato / టమాటా')).toBe('Tomato / tamaataa')
  })
})

describe('soundKey: stored Telugu meets typed English', () => {
  const pairs: Array<[string, string[]]> = [
    ['టమాటా', ['tamata', 'tamaata', 'tamaataa', 'Tamata']],
    ['శ్రీను', ['srinu', 'sreenu', 'shreenu', 'shrinu']],
    ['రెడ్డి', ['reddy', 'reddi', 'redy']],
    ['కృష్ణ', ['krishna', 'krisna', 'krishnaa']],
    ['మోహన్', ['mohan']],
    ['తోట', ['thota', 'tota']],
    ['లక్ష్మి', ['lakshmi', 'laxmi', 'laksmi']],
    ['వెంకటేశ్వర్లు', ['venkateswarlu', 'venkateshwarlu', 'wenkateswarlu']],
    ['భీమవరం', ['bhimavaram', 'bheemavaram']],
    ['తాడేపల్లిగూడెం', ['tadepalligudem', 'thadepalligudem', 'tadepalligoodem']],
    ['బెండకాయ', ['bendakaya', 'bendakaaya']],
    ['పెండింగ్', ['pending']],
  ]
  for (const [telugu, typed] of pairs) {
    it(`${telugu} ← ${typed.join(', ')}`, () => {
      for (const t of typed) expect(soundKey(t)).toBe(soundKey(telugu))
    })
  }

  // USE: typing is incremental — results must appear before the word is done.
  it('a half-typed word is a prefix of the full key', () => {
    expect(soundKey('టమాటా').startsWith(soundKey('tama'))).toBe(true)
    expect(soundKey('వెంకటేశ్వర్లు').startsWith(soundKey('venkat'))).toBe(true)
  })

  it('keeps genuinely different words apart', () => {
    expect(soundKey('ravi')).not.toBe(soundKey('రాము'))
    expect(soundKey('tamata')).not.toBe(soundKey('బెండకాయ'))
  })
})

describe('phoneticKey', () => {
  it('keeps word boundaries and drops punctuation', () => {
    expect(phoneticKey('Ravi-Kumar  Reddy')).toBe('ravi kumar redi')
  })

  it('keeps ch (చ) distinct from a hard c', () => {
    expect(phoneticKey('chandra')).toBe('candra')
    expect(phoneticKey('carrot')).toBe('karot')
  })
})

describe('Telugu preview of typed English (display only)', () => {
  it('spells common typing letter by letter', () => {
    expect(latinToTeluguPreview('srinu')).toBe('స్రిను')
    expect(latinToTeluguPreview('reddy')).toBe('రెద్ది')
    expect(latinToTeluguPreview('rangayya')).toBe('రంగయ్య')
  })

  // USE: the literal guess for "tamata" is టమట; the user is looking for
  // టమాటా. Preferring a real word they can find makes the hint trustworthy.
  it('prefers a real Telugu word with the same sound', () => {
    expect(teluguPreview('tamata', ['టమాటా'])).toBe('టమాటా')
    expect(teluguPreview('tama', ['టమాటా', 'తమలపాకు'])).toBe('టమాటా')
    expect(teluguPreview('srinu reddy', ['శ్రీను రెడ్డి | 98765'])).toBe('శ్రీను రెడ్డి')
  })

  it('falls back to the letter-by-letter guess when nothing matches', () => {
    expect(teluguPreview('mohan', ['టమాటా'])).toBe('మొహన్')
  })
})
