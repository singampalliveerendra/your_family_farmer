import type { Language } from './translations'

// English + Telugu copies of what a farmer types for a produce (2026-11-20).
//
// The problem: a buyer who picked English still saw Telugu, because farmers
// type the name, variety, description and "How we grow" in whatever language
// they think in, and the page showed it exactly as typed.
//
// Now each listing carries `translations` (one jsonb column):
//   { name: { of: "కందిపప్పు", en: "Toor dal", te: "కందిపప్పు" }, ... }
// `of` is the text that was translated. The copy is used only while `of`
// still equals the text on the listing, so when the farmer edits the text the
// old translation stops showing by itself — no clean-up step to forget — and
// the farmer's own words are shown until the new translation arrives.
//
// Filled on the server by src/lib/listingTranslate.ts (Gemini, free tier).
// This file is safe for the browser.

export const TRANSLATED_FIELDS = ['name', 'variety', 'description', 'how_we_grow'] as const
export type TranslatedField = (typeof TRANSLATED_FIELDS)[number]

export type FieldTranslation = { of: string; en: string; te: string }
export type Translations = Partial<Record<TranslatedField, FieldTranslation>>

const TELUGU_LETTER = /[ఀ-౿]/g
const ANY_LETTER = /\p{L}/gu

/** Share of the letters that are Telugu script (0 when there are no letters). */
export function teluguShare(text: string): number {
  const letters = text.match(ANY_LETTER)?.length ?? 0
  if (!letters) return 0
  return (text.match(TELUGU_LETTER)?.length ?? 0) / letters
}

/** Mostly Telugu script — a Telugu copy we can trust, or Telugu typed by the farmer. */
export function looksLikeTelugu(text: string): boolean {
  return teluguShare(text) >= 0.5
}

/** No Telugu letters at all. */
export function hasNoTelugu(text: string): boolean {
  return teluguShare(text) === 0
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * The stored copy for this field, if it is a copy of `original` as it reads
 * now. Anything malformed (hand-edited row, older shape) counts as "none".
 */
export function translationFor(
  translations: unknown,
  field: TranslatedField,
  original: string | null | undefined,
): FieldTranslation | null {
  const text = clean(original)
  if (!text || !translations || typeof translations !== 'object') return null
  const t = (translations as Record<string, unknown>)[field]
  if (!t || typeof t !== 'object') return null
  const { of, en, te } = t as Record<string, unknown>
  if (clean(of) !== text) return null
  return { of: text, en: clean(en), te: clean(te) }
}

/**
 * What the reader sees for a farmer-typed text:
 *   - Telugu reader, text already in Telugu → the farmer's own words.
 *   - otherwise the translation in the reader's language, when we have one;
 *   - else the text exactly as typed (a translation that has not arrived yet,
 *     or failed, never hides the text).
 */
export function localizeText(
  value: string | null | undefined,
  lang: Language,
  translations: unknown,
  field: TranslatedField,
): string {
  const text = clean(value)
  if (!text) return ''
  if (lang === 'te' && looksLikeTelugu(text)) return text
  const t = translationFor(translations, field, text)
  const copy = lang === 'te' ? t?.te : t?.en
  return copy || text
}

/**
 * Fields of a listing whose text has no current translation yet — what the
 * translator still has to do. A field tried before and failed is stored with
 * empty copies and counts as done, so it is not sent again and again; editing
 * the text makes it due once more.
 */
export function pendingFields(row: Record<string, unknown>): TranslatedField[] {
  return TRANSLATED_FIELDS.filter((f) => clean(row[f]) && !translationFor(row.translations, f, clean(row[f])))
}

/**
 * Keep only the copies that still match the row's text. Used when saving, so
 * a stale copy of an old text does not pile up in the column.
 */
export function currentTranslations(row: Record<string, unknown>): Translations {
  const out: Translations = {}
  for (const f of TRANSLATED_FIELDS) {
    const t = translationFor(row.translations, f, clean(row[f]))
    if (t) out[f] = t
  }
  return out
}

/** Only the given fields' copies — the feed sends name + variety, not the long texts. */
export function pickTranslations(translations: unknown, fields: readonly TranslatedField[]): Translations | null {
  if (!translations || typeof translations !== 'object') return null
  const src = translations as Record<string, FieldTranslation>
  const out: Translations = {}
  for (const f of fields) if (src[f]) out[f] = src[f]
  return Object.keys(out).length ? out : null
}
