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
  if (sepIdx === -1) {
    const trimmed = value.trim()
    if (lang === 'te') return produceNameToTe(trimmed) ?? trimmed
    return trimmed
  }
  const en = value.slice(0, sepIdx).trim()
  const te = value.slice(sepIdx + 1).trim()
  return lang === 'te' ? te || en : en || te
}
