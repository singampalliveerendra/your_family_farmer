import type { NextRequest } from 'next/server'

export type Lang = 'en' | 'te'

// Read the user's chosen language from the `yff_lang` cookie set by the client
// LanguageProvider. Defaults to English. Lets API routes localise the error
// messages they return so the UI shows only one language at a time.
export function reqLang(req: NextRequest): Lang {
  return req.cookies.get('yff_lang')?.value === 'te' ? 'te' : 'en'
}

export function tr(lang: Lang, en: string, te: string): string {
  return lang === 'te' ? te : en
}
