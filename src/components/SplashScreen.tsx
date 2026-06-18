'use client'

import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

// Phases: 'show' while visible, 'out' during the fade, 'done' = unmounted.
// We start at 'show' so the overlay is part of the server-rendered HTML and
// paints on the very first frame — covering the page so the consumer screen
// never flashes underneath. The blocking script in layout.tsx decides whether
// this load should actually play (first open) or be skipped (already shown this
// session) via the `splash-skip` class on <html>; on skip, CSS hides the
// overlay before paint and the effect below unmounts it.
type Phase = 'show' | 'out' | 'done'

export default function SplashScreen() {
  const { L } = useLang()
  const [phase, setPhase] = useState<Phase>('show')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    // The pre-paint script in layout.tsx already wrote the sessionStorage flag
    // and tagged <html> when the splash had played before this session.
    const alreadyShown = document.documentElement.classList.contains('splash-skip')

    if (alreadyShown) {
      setPhase('done')
      return
    }

    timers.current.push(setTimeout(() => setPhase('out'), 2900))  // 2.9s: start fade out
    timers.current.push(setTimeout(() => setPhase('done'), 3400)) // 3.4s: home visible

    return clearTimers
  }, [])

  // Tapping anywhere during the splash skips it immediately.
  const skip = () => {
    clearTimers()
    setPhase('done')
  }

  if (phase === 'done') return null

  return (
    <div
      onClick={skip}
      role="presentation"
      aria-hidden
      className={`splash-overlay fixed inset-0 z-[200] flex flex-col items-center justify-center px-6 text-center select-none ${
        phase === 'out' ? 'is-out' : ''
      }`}
      style={{ backgroundColor: '#1a5c2a' }}
    >
      {/* YFF circle logo */}
      <div className="splash-logo flex items-center justify-center w-24 h-24 rounded-full border-2 border-white">
        <span className="font-black text-white" style={{ fontSize: 32, lineHeight: 1 }}>
          YFF
        </span>
      </div>

      {/* Brand name */}
      <h1 className="splash-name font-bold text-white mt-5" style={{ fontSize: 22 }}>
        {L('YourFamilyFarmer', 'యువర్ ఫ్యామిలీ ఫార్మర్')}
      </h1>

      {/* Tagline */}
      <p className="splash-tagline italic text-white mt-4" style={{ fontSize: 16 }}>
        No middlemen. Just farmers.
      </p>

      {/* Slowly rotating wheat */}
      <span className="splash-wheat inline-block mt-6" style={{ fontSize: 24 }} aria-hidden>
        🌾
      </span>
    </div>
  )
}
