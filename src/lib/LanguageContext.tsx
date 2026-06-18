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

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  tx: t.en,
  bi: (key) => t.en[key] ?? '',
  L: (en) => en,
})

// Mirror the language into a (non-HttpOnly) cookie so server routes — which
// have no access to localStorage — can return error messages in the user's
// chosen language. Travels with every request automatically.
function writeLangCookie(lang: Language) {
  if (typeof document === 'undefined') return
  document.cookie = `yff_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('yff_lang') : null
    if (saved === 'en' || saved === 'te') {
      setLangState(saved)
      writeLangCookie(saved)
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
