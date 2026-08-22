import type { NextRequest } from 'next/server'

export type Lang = 'en' | 'te'

// Read the user's chosen language from the `yff_lang` cookie set by the client
// LanguageProvider. Lets API routes localise the error messages they return so
// the UI shows only one language at a time.
//
// Defaults to Telugu, matching the LanguageProvider — English is what someone
// has to pick. The cookie is missing on the very first request of a session
// (the provider writes it from an effect, after the page has already loaded),
// so the default is what an early error message actually gets shown in.
export function reqLang(req: NextRequest): Lang {
  return req.cookies.get('yff_lang')?.value === 'en' ? 'en' : 'te'
}

export function tr(lang: Lang, en: string, te: string): string {
  return lang === 'te' ? te : en
}
