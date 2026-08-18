'use client'

import { useLang } from '@/lib/LanguageContext'

// `variant` controls contrast: 'dark' (default) is built for a dark/green
// header (white pill on a translucent-white track). 'light' is for a white
// header — without it the white-on-white pill is invisible (see farmer profile
// TopNav), so light uses a grey track and a green active pill instead.
//
// `size` is padding only. 'sm' exists for the /home header, where the wordmark,
// the toggle and the Download pill have to share a 390px row.
export default function LanguageToggle({
  variant = 'dark',
  size = 'md',
}: {
  variant?: 'dark' | 'light'
  size?: 'md' | 'sm'
}) {
  const { lang, setLang } = useLang()

  const trackCls = variant === 'light' ? 'bg-gray-100' : 'bg-white/10'
  const activeCls =
    variant === 'light' ? 'bg-green-700 text-white shadow-sm' : 'bg-white text-green-800 shadow-sm'
  const inactiveCls = variant === 'light' ? 'text-gray-500' : 'text-white/80'
  const padCls = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1'

  return (
    <div className={`flex items-center ${trackCls} rounded-full p-0.5 text-xs font-bold`}>
      <button
        onClick={() => setLang('en')}
        className={`${padCls} rounded-full transition-all ${lang === 'en' ? activeCls : inactiveCls}`}
        aria-label="Switch to English"
      >
        EN
      </button>
      <button
        onClick={() => setLang('te')}
        className={`${padCls} rounded-full transition-all ${lang === 'te' ? activeCls : inactiveCls}`}
        aria-label="తెలుగులోకి మార్చండి"
      >
        తె
      </button>
    </div>
  )
}
