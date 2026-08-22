import { Language } from './translations'
import { produceNameToTe } from './produceNamesTe'

/**
 * Produce names and varieties are stored bilingually as "English / తెలుగు".
 * Show only the side that matches the active language. When there's no "/"
 * separator we return the whole string unchanged, so single-language values
 * (and names that happen to contain no slash) are left alone.
 *
 * For English-only names (no slash) we still try a built-in produce dictionary
 * so common crops show Telugu when the Telugu toggle is on. Unknown names fall
 * back to the English text unchanged.
 */
export function localizeName(value: string | null | undefined, lang: Language): string {
  if (!value) return ''
  const sepIdx = value.indexOf('/')
  if (sepIdx !== -1) {
    const en = value.slice(0, sepIdx).trim()
    const te = value.slice(sepIdx + 1).trim()
    return lang === 'te' ? te || en : en || te
  }
  const trimmed = value.trim()
  if (lang !== 'te') return trimmed
  return produceNameToTe(trimmed) ?? localizeSegments(trimmed)
}

/**
 * Last resort for a name like "Aavu Neyyi - Cow ghee" — one product written
 * twice, once in each language, which is a common way the produce form gets
 * filled in. Translate each " - " segment the dictionary knows, leave the rest
 * alone, then collapse neighbours that came out identical so the card reads
 * "ఆవు నెయ్యి" rather than "ఆవు నెయ్యి - ఆవు నెయ్యి".
 *
 * A name where nothing resolves ("Bahuroopi Rice - Single Polish") comes back
 * untouched. Half-guessing a product name is worse than leaving it as the
 * farmer wrote it, so a qualifier the dictionary doesn't know is preserved:
 * "Tomato - Country" becomes "టమాటా - Country", never just "టమాటా".
 */
function localizeSegments(name: string): string {
  if (!name.includes(' - ')) return name
  const parts = name.split(' - ').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return name

  const mapped = parts.map((p) => produceNameToTe(p) ?? p)
  if (mapped.every((m, i) => m === parts[i])) return name

  return mapped.filter((m, i) => i === 0 || m !== mapped[i - 1]).join(' - ')
}

// Units the produce form offers. kg/gram/litre were left in English even in the
// farmer's own dropdown, so "100 kg left" sat under a Telugu crop name.
const UNIT_TE: Record<string, string> = {
  kg: 'కేజీ',
  gram: 'గ్రా',
  g: 'గ్రా',
  litre: 'లీటర్',
  liter: 'లీటర్',
  l: 'లీ',
  piece: 'నగ',
  bunch: 'కట్ట',
  dozen: 'డజను',
  quintal: 'క్వింటాల్',
}

/** Telugu for a unit of sale, falling back to the stored text unchanged. */
export function localizeUnit(unit: string | null | undefined, lang: Language): string {
  if (!unit) return ''
  const trimmed = unit.trim()
  if (lang !== 'te') return trimmed
  return UNIT_TE[trimmed.toLowerCase()] ?? trimmed
}
