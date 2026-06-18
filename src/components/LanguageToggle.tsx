'use client'

import { useLang } from '@/lib/LanguageContext'

export default function LanguageToggle() {
  const { lang, setLang, L } = useLang()

  return (
    <div className="flex items-center bg-white/10 rounded-full p-0.5 text-xs font-bold">
      <button
        onClick={() => setLang('en')}
        className={`px-3 py-1 rounded-full transition-all ${
          lang === 'en' ? 'bg-white text-green-800 shadow-sm' : 'text-white/80'
        }`}
        aria-label="Switch to English"
      >
        EN
      </button>
      <button
        onClick={() => setLang('te')}
        className={`px-3 py-1 rounded-full transition-all ${
          lang === 'te' ? 'bg-white text-green-800 shadow-sm' : 'text-white/80'
        }`}
        aria-label="తెలుగులోకి మార్చండి"
      >
        తె
      </button>
    </div>
  )
}
