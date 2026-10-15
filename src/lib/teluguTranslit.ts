// Telugu ⇄ Latin, for SEARCH — not for publishing text.
//
// People type Telugu on an English keyboard however they learned to: "srinu",
// "sreenu", "shreenu" are all శ్రీను. Turning that guess INTO Telugu script is
// ambiguous (tamata → టమాట or టమాటా?) and fails outright on a half-typed word,
// so search never depends on it. Instead both sides are brought to the same
// loose "sounds-like" key:
//
//   stored Telugu  ──teluguToLatin──▶  "shriinu"  ──phoneticKey──▶  "srinu"
//   typed English  ───────────────────────────────phoneticKey──▶  "srinu"
//
// Telugu → Latin is the easy direction: the script is phonetic, so every
// letter has exactly one reading. phoneticKey then forgets the distinctions
// casual typing doesn't make — vowel length, aspiration, dental vs retroflex,
// doubled letters.
//
// latinToTeluguPreview goes the hard direction, but ONLY to show the user
// "searching: శ్రీను" under the box. It is a best guess and never decides a
// match.

// ── Telugu → Latin ─────────────────────────────────────────────────────────

const INDEPENDENT_VOWELS: Record<string, string> = {
  'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ii', 'ఉ': 'u', 'ఊ': 'uu',
  'ఋ': 'ri', 'ౠ': 'rii', 'ఌ': 'li', 'ౡ': 'lii',
  // Long ఏ / ఓ are read as plain e / o, not ee / oo: in casual English typing
  // "ee" and "oo" mean ఈ and ఊ ("sreenu", "koora"), and "mohan" is మోహన్.
  'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au',
}

const VOWEL_SIGNS: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ii', 'ు': 'u', 'ూ': 'uu',
  'ృ': 'ri', 'ౄ': 'rii', 'ౢ': 'li', 'ౣ': 'lii',
  'ె': 'e', 'ే': 'e', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au',
}

const CONSONANTS: Record<string, string> = {
  'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'n',
  'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'n',
  'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
  'త': 't', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n',
  'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm',
  'య': 'y', 'ర': 'r', 'ఱ': 'r', 'ల': 'l', 'ళ': 'l', 'ఴ': 'l', 'వ': 'v',
  'శ': 'sh', 'ష': 'sh', 'స': 's', 'హ': 'h',
  // Old-style / Urdu-loan letters still seen in names.
  'ౘ': 'ch', 'ౙ': 'j', 'ౚ': 'r',
}

const VIRAMA = '్'
const ANUSVARA = 'ం'
const LABIALS = new Set(['ప', 'ఫ', 'బ', 'భ', 'మ'])

/**
 * Read Telugu text out in Latin letters. Non-Telugu characters pass through,
 * so "Tomato / టమాటా" becomes "Tomato / tamaataa".
 */
export function teluguToLatin(text: string): string {
  const s = text.normalize('NFC')
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    const next = s[i + 1]

    const cons = CONSONANTS[ch]
    if (cons !== undefined) {
      out += cons
      if (next === VIRAMA) { i++; continue }        // dead consonant: no vowel
      const sign = next !== undefined ? VOWEL_SIGNS[next] : undefined
      if (sign !== undefined) { out += sign; i++; continue }
      out += 'a'                                     // inherent vowel
      continue
    }

    const vowel = INDEPENDENT_VOWELS[ch]
    if (vowel !== undefined) { out += vowel; continue }

    // A stray vowel sign (after a non-consonant) still has a sound.
    const loose = VOWEL_SIGNS[ch]
    if (loose !== undefined) { out += loose; continue }

    if (ch === ANUSVARA) {
      // Said "m" before p/b/m and at the end of a word, "n" before anything else.
      out += next === undefined || LABIALS.has(next) || !CONSONANTS[next] ? 'm' : 'n'
      continue
    }
    if (ch === 'ః') { out += 'h'; continue }     // visarga
    if (ch === 'ఁ' || ch === 'ఀ') { out += 'n'; continue } // half-nasal
    if (ch === VIRAMA) continue
    if (ch === '‌' || ch === '‍') continue  // ZWNJ / ZWJ (ఆర్డర్‌)

    const code = ch.charCodeAt(0)
    if (code >= 0x0C66 && code <= 0x0C6F) { out += String(code - 0x0C66); continue } // ౦–౯

    out += ch
  }
  return out
}

// ── The sounds-like key ────────────────────────────────────────────────────

/**
 * A loose spelling-independent key for Latin text (run teluguToLatin first on
 * anything that may hold Telugu). Lower-case letters and digits only; spaces
 * are kept so callers can still tell words apart.
 *
 * What it forgets, and why:
 *   - vowel length       aa→a, ii/ee→i, uu/oo→u   ("sreenu" = "srinu")
 *   - aspiration         kh→k, th→t, dh→d, bh→b … ("thota" = "tota")
 *   - sibilants          sh→s                      ("shiva" = "siva")
 *   - doubled letters    dd→d                      ("reddy" = "redy")
 *   - English letters Telugu has no use for: w→v, f→p, z→j, q→k, x→ks,
 *     c (not ch)→k, word-final y→i ("reddy" = రెడ్డి)
 * Retroflex vs dental (ట/త, డ/ద, ణ/న, ళ/ల) is already gone after
 * teluguToLatin, which reads both as the same Latin letter.
 */
export function phoneticKey(latin: string): string {
  let s = latin.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  s = s.replace(/[^a-z0-9]+/g, ' ')
  s = s
    .replace(/ch/g, '\u0001')     // protect ch (చ) from the c→k rule
    .replace(/c/g, 'k')
    .replace(/\u0001/g, 'c')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 'j')
    .replace(/w/g, 'v')
    .replace(/ph|f/g, 'p')
    .replace(/sh/g, 's')
    .replace(/([kgcjtdpb])h/g, '$1')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/y\b/g, 'i')
  s = s.replace(/([a-z])\1+/g, '$1') // aa→a, ii→i, dd→d …
  return s.replace(/\s+/g, ' ').trim()
}

/** Sounds-like key for any text, Telugu or English. */
export function soundKey(text: string): string {
  return phoneticKey(teluguToLatin(text))
}

// ── Latin → Telugu, for the "searching: …" hint only ───────────────────────

const LATIN_CONSONANTS: Array<[string, string]> = [
  // Longest first, so "chh" wins over "ch" over "c".
  ['ksh', 'క్ష'], ['chh', 'ఛ'],
  ['kh', 'ఖ'], ['gh', 'ఘ'], ['ch', 'చ'], ['jh', 'ఝ'], ['th', 'త'], ['dh', 'ధ'],
  ['ph', 'ఫ'], ['bh', 'భ'], ['sh', 'శ'],
  ['k', 'క'], ['c', 'క'], ['q', 'క'], ['g', 'గ'], ['j', 'జ'], ['z', 'జ'],
  ['t', 'ట'], ['d', 'ద'], ['n', 'న'], ['p', 'ప'], ['f', 'ఫ'], ['b', 'బ'], ['m', 'మ'],
  ['y', 'య'], ['r', 'ర'], ['l', 'ల'], ['v', 'వ'], ['w', 'వ'], ['s', 'స'], ['h', 'హ'],
  ['x', 'క్స'],
]

// [latin, independent form, vowel sign] — longest first.
const LATIN_VOWELS: Array<[string, string, string]> = [
  ['aa', 'ఆ', 'ా'], ['ai', 'ఐ', 'ై'], ['au', 'ఔ', 'ౌ'], ['ou', 'ఔ', 'ౌ'],
  ['ii', 'ఈ', 'ీ'], ['ee', 'ఈ', 'ీ'], ['uu', 'ఊ', 'ూ'], ['oo', 'ఊ', 'ూ'],
  ['a', 'అ', ''], ['i', 'ఇ', 'ి'], ['u', 'ఉ', 'ు'], ['e', 'ఎ', 'ె'], ['o', 'ఒ', 'ొ'],
]

function matchAt<T extends [string, ...string[]]>(word: string, i: number, table: T[]): T | null {
  for (const entry of table) if (word.startsWith(entry[0], i)) return entry
  return null
}

function wordToTelugu(word: string): string {
  let out = ''
  let i = 0
  let pendingConsonant = false // last output was a consonant still owing a vowel
  while (i < word.length) {
    const v = matchAt(word, i, LATIN_VOWELS)
    if (v) {
      out += pendingConsonant ? v[2] : v[1]
      pendingConsonant = false
      i += v[0].length
      continue
    }
    if (word[i] === 'y' && i === word.length - 1 && pendingConsonant) {
      out += 'ి'
      pendingConsonant = false
      i += 1
      continue
    }
    const c = matchAt(word, i, LATIN_CONSONANTS)
    if (c) {
      // n/m straight before another consonant is the nasal dot: "banda" → బంద.
      if ((c[0] === 'n' || c[0] === 'm') && i > 0 && !pendingConsonant) {
        const after = matchAt(word, i + 1, LATIN_CONSONANTS)
        if (after && !matchAt(word, i + 1, LATIN_VOWELS)) {
          out += ANUSVARA
          i += 1
          continue
        }
      }
      if (pendingConsonant) out += VIRAMA // consonant cluster
      out += c[1]
      pendingConsonant = true
      i += c[0].length
      continue
    }
    if (pendingConsonant) { out += VIRAMA; pendingConsonant = false }
    out += word[i]
    i += 1
  }
  if (pendingConsonant) out += VIRAMA
  return out
}

/**
 * Best-guess Telugu spelling of what the user typed in Latin letters, for
 * display under the search box. Digits, punctuation and existing Telugu pass
 * through. Display only — matching uses soundKey.
 */
export function latinToTeluguPreview(text: string): string {
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((part) => (/[a-z]/.test(part) ? wordToTelugu(part) : part))
    .join('')
}

/** True if the text contains Latin letters (worth showing a Telugu preview for). */
export function hasLatinLetters(text: string): boolean {
  return /[a-z]/i.test(text)
}

/**
 * The Telugu to show for a typed query: per word, a REAL Telugu word whose
 * sound key starts with the typed word's (a crop from the dictionary, a name
 * or village from the user's own orders), falling back to the letter-by-letter
 * guess. "tamata" then shows టమాటా — the spelling the user will actually find —
 * rather than the literal టమట. Display only.
 */
export function teluguPreview(query: string, vocabulary: Iterable<string>): string {
  const byKey: Array<{ key: string; word: string }> = []
  const seen = new Set<string>()
  for (const entry of vocabulary) {
    for (const word of entry.normalize('NFC').split(/[^ఀ-౿‌‍]+/)) {
      const w = word.replace(/[‌‍]/g, '')
      if (!w || seen.has(w)) continue
      seen.add(w)
      const key = soundKey(w)
      if (key) byKey.push({ key, word: w })
    }
  }
  return query
    .split(/(\s+)/)
    .map((part) => {
      if (!/[a-z]/i.test(part)) return part
      const key = soundKey(part)
      if (key.length >= 2) {
        // Exact sound first, then the shortest word it is the start of.
        const exact = byKey.find((e) => e.key === key)
        if (exact) return exact.word
        const prefix = byKey
          .filter((e) => e.key.startsWith(key))
          .sort((a, b) => a.key.length - b.key.length)[0]
        if (prefix) return prefix.word
      }
      return wordToTelugu(part.toLowerCase())
    })
    .join('')
}
