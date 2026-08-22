import { PRODUCE_NAME_TE, produceNameToTe } from './produceNamesTe'

/**
 * Bilingual produce search.
 *
 * Crop names are stored however whoever typed them left them: mostly English
 * ("Tomato"), sometimes bilingual ("Tomato / టమాటా"), sometimes Telugu only
 * ("టమాటా"). A buyer typing "టమాటా" into the search box was matched against
 * the raw column and found nothing, so the entire Telugu-speaking half of the
 * audience could only search in a language they may not read.
 *
 * The fix is to widen the HAYSTACK rather than the query: every listing is
 * indexed under both languages, so one plain substring test answers a query in
 * either. That keeps partial typing working — "టమా" hits "టమాటా" the same way
 * "tom" hits "tomato" — which a query-translation approach would lose, since a
 * half-typed word translates to nothing.
 */

// Telugu → the English names that map to it. Several English names share one
// Telugu word (okra / lady finger are both బెండకాయ), hence a list.
const TE_TO_EN = new Map<string, string[]>()
for (const [en, te] of Object.entries(PRODUCE_NAME_TE)) {
  const key = te.normalize('NFC')
  const existing = TE_TO_EN.get(key)
  if (existing) existing.push(en)
  else TE_TO_EN.set(key, [en])
}

// The Telugu Unicode block. Used only to tell which side of the dictionary a
// piece of text belongs on.
const TELUGU_CHAR = /[ఀ-౿]/

export function hasTelugu(value: string): boolean {
  return TELUGU_CHAR.test(value)
}

/**
 * Dictionary hits for a name, in both directions. Longest crop names in the
 * dictionary are two words ("bottle gourd", "curry leaves"), so single words
 * and adjacent pairs are enough to find a crop inside a longer name like
 * "Fresh Bottle Gourd" — an exact whole-string lookup alone would miss it.
 */
function dictionaryHits(text: string): string[] {
  const hits: string[] = []
  const add = (value: string) => {
    const te = produceNameToTe(value)
    if (te) {
      hits.push(te)
      // Follow the Telugu word back to its OTHER English spellings. Several
      // names share one Telugu word ("turmeric" and the transliterated
      // "pasupu" are both పసుపు), so this one hop is what lets a listing
      // named "Pasupu" answer a search for "turmeric".
      const siblings = TE_TO_EN.get(te.normalize('NFC'))
      if (siblings) hits.push(...siblings)
    }
    const ens = TE_TO_EN.get(value.normalize('NFC'))
    if (ens) hits.push(...ens)
  }

  add(text)
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    add(words[i])
    if (i + 1 < words.length) add(`${words[i]} ${words[i + 1]}`)
  }
  return hits
}

/** One stored value expanded into every form it could be searched by. */
function bothLanguages(value: string | null | undefined): string[] {
  if (!value) return []
  const raw = value.trim().normalize('NFC')
  if (!raw) return []

  const forms = [raw]
  // "English / తెలుగు" already carries both sides — split so each half is also
  // matched on its own, and so the dictionary gets a clean term to look up.
  const slash = raw.indexOf('/')
  if (slash !== -1) {
    const en = raw.slice(0, slash).trim()
    const te = raw.slice(slash + 1).trim()
    if (en) forms.push(en)
    if (te) forms.push(te)
  }

  for (const form of [...forms]) forms.push(...dictionaryHits(form))
  return forms
}

export type SearchableProduce = {
  name?: string | null
  variety?: string | null
  description?: string | null
}

/**
 * Every term a listing can be found by, lower-cased and space-joined.
 * Name and variety only — a description mentioning "we grow this beside our
 * tomatoes" should not make a rice listing answer a tomato search.
 */
export function produceNameHaystack(p: SearchableProduce): string {
  return [...bothLanguages(p.name), ...bothLanguages(p.variety)].join(' ').toLowerCase()
}

/** As above, plus the free-text description. This is what the search box uses. */
export function produceSearchHaystack(p: SearchableProduce): string {
  const description = (p.description ?? '').trim().normalize('NFC')
  return `${produceNameHaystack(p)} ${description.toLowerCase()}`
}

/**
 * Does this listing answer the query? Case-insensitive substring match against
 * the bilingual haystack, so an English query finds a Telugu-named listing and
 * a Telugu query finds an English-named one.
 */
export function matchesProduceQuery(p: SearchableProduce, query: string): boolean {
  const q = query.trim().normalize('NFC').toLowerCase()
  if (!q) return true
  return produceSearchHaystack(p).includes(q)
}

/**
 * Does this listing's NAME match one of a category's English keywords? Used
 * for older listings with no explicit `category`, where the category has to be
 * guessed from the crop name — via the same bilingual haystack, so a listing
 * named "టమాటా" still lands under Vegetables.
 */
export function matchesCategoryKeywords(p: SearchableProduce, keywords: string[]): boolean {
  const haystack = produceNameHaystack(p)
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()))
}
