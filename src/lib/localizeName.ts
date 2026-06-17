import { Language } from './translations'

/**
 * Produce names and varieties are stored bilingually as "English / తెలుగు".
 * Show only the side that matches the active language. When there's no "/"
 * separator we return the whole string unchanged, so single-language values
 * (and names that happen to contain no slash) are left alone.
 */
export function localizeName(value: string | null | undefined, lang: Language): string {
  if (!value) return ''
  const sepIdx = value.indexOf('/')
  if (sepIdx === -1) return value.trim()
  const en = value.slice(0, sepIdx).trim()
  const te = value.slice(sepIdx + 1).trim()
  return lang === 'te' ? te || en : en || te
}
