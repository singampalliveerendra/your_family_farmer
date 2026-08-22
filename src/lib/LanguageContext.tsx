'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { t, Language, TranslationKey } from './translations'

type LanguageContextType = {
  lang: Language
  setLang: (lang: Language) => void
  tx: typeof t.en
  bi: (key: TranslationKey) => string
  // Pick the active language from an explicit English/Telugu pair. Used to
  // convert inline bilingual UI (L('English', 'తెలుగు')) into text that actually
  // switches with the toggle, without fragile string-splitting.
  L: (en: string, te: string) => string
}

// Telugu is the default. Nearly every buyer and farmer in the districts this
// serves reads Telugu first, so English is the opt-in, not the baseline. The
// fallback below only applies outside a LanguageProvider; the real default is
// the useState seed in the provider.
const LanguageContext = createContext<LanguageContextType>({
  lang: 'te',
  setLang: () => {},
  tx: t.te,
  bi: (key) => (t.te as Record<string, string>)[key] ?? t.en[key] ?? '',
  L: (_en, te) => te,
})

// Mirror the language into a (non-HttpOnly) cookie so server routes — which
// have no access to localStorage — can return error messages in the user's
// chosen language. Travels with every request automatically.
function writeLangCookie(lang: Language) {
  if (typeof document === 'undefined') return
  document.cookie = `yff_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Telugu until told otherwise. Seeding the state (rather than flipping it in
  // the effect below) keeps the server-rendered markup and the first client
  // render in the same language, so there is no English flash before Telugu
  // paints — which on a slow 4G phone would be most of the first second.
  const [lang, setLangState] = useState<Language>('te')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('yff_lang') : null
    if (saved === 'en' || saved === 'te') {
      setLangState(saved)
      writeLangCookie(saved)
    } else {
      // Never chosen. Write the default out so server routes localise their
      // error messages to Telugu too, instead of falling back to English.
      writeLangCookie('te')
    }
  }, [])

  const setLang = (next: Language) => {
    setLangState(next)
    if (typeof window !== 'undefined') localStorage.setItem('yff_lang', next)
    writeLangCookie(next)
  }

  const tx = t[lang]
  const bi = (key: TranslationKey) => (t[lang] as Record<string, string>)[key] ?? t.en[key] ?? ''
  const L = (en: string, te: string) => (lang === 'te' ? te : en)

  return (
    <LanguageContext.Provider value={{ lang, setLang, tx, bi, L }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
