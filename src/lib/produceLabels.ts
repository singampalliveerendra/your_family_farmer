import type { Language } from './translations'

// Bilingual labels for the farming-method pill and the category chip.
//
// These two maps used to be copy-pasted into three pages. Only the copy on
// /consumer was bilingual; /consumer/produce/[id] and /consumer/harvest/[id]
// each held an English-only `Record<string, string>`, so those two pages showed
// "Semi-org" and "Leafy Greens" to a Telugu reader no matter what the toggle
// said. A label map is invisible to a `>Text<` scan, which is why it outlived
// every other sweep — see the same shape caught in METHOD_SHORT on the produce
// cards. Keeping one copy here is what stops the third page drifting back.
//
// The Telugu is deliberately SHORTER than a literal translation: both labels
// render inside a pill in a 390px grid column, and "సెమీ ఆర్గానిక్" wraps the
// card. Match this brevity when adding a method.

export type Bilingual = { en: string; te: string }

export const METHOD_SHORT: Record<string, Bilingual> = {
  natural: { en: 'Natural', te: 'సహజం' },
  organic: { en: 'Organic', te: 'సేంద్రీయ' },
  low_chemical: { en: 'Semi-org', te: 'సెమీ' },
  chemical: { en: 'Chemical', te: 'రసాయన' },
}

export const CATEGORY_LABEL: Record<string, Bilingual> = {
  all: { en: 'All', te: 'అన్నీ' },
  vegetables: { en: 'Vegetables', te: 'కూరగాయలు' },
  fruits: { en: 'Fruits', te: 'పళ్ళు' },
  grains: { en: 'Grains & Pulses', te: 'ధాన్యాలు' },
  leafy: { en: 'Leafy Greens', te: 'ఆకు కూరలు' },
  spices: { en: 'Spices', te: 'మసాలాలు' },
  other: { en: 'Other', te: 'ఇతర' },
}

export function pick(label: Bilingual | undefined, lang: Language): string | undefined {
  if (!label) return undefined
  return lang === 'te' ? label.te : label.en
}

// `method` arrives from the DB in whatever case the row was written in, and an
// unknown value falls back to natural — the same default the produce form uses,
// so a listing never renders a blank pill.
export function methodLabel(method: string | null | undefined, lang: Language): string {
  const key = method?.toLowerCase() ?? 'natural'
  return pick(METHOD_SHORT[key], lang) ?? pick(METHOD_SHORT.natural, lang)!
}

// Unknown/absent categories return undefined on purpose: the chip is then not
// rendered at all, rather than showing a raw DB key like "leafy".
export function categoryLabel(category: string | null | undefined, lang: Language): string | undefined {
  if (!category) return undefined
  return pick(CATEGORY_LABEL[category.toLowerCase()], lang)
}
