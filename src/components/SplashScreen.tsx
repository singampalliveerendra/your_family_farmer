'use client'

import { useEffect, useRef, useState } from 'react'

// Phases: 'init' before we've decided (avoids SSR/hydration flash),
// 'show' while visible, 'out' during the 0.2s fade, 'done' = unmounted.
type Phase = 'init' | 'show' | 'out' | 'done'

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase>('init')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    // Show only once per session (per browser tab). A page refresh keeps the
    // flag, so the splash appears on first open only — not on every reload.
    let alreadyShown = false
    try { alreadyShown = sessionStorage.getItem('splash_shown') === 'true' } catch { /* private mode */ }

    if (alreadyShown) {
      setPhase('done')
      return
    }

    try { sessionStorage.setItem('splash_shown', 'true') } catch { /* ignore */ }

    setPhase('show')
    timers.current.push(setTimeout(() => setPhase('out'), 2900))  // 2.9s: start fade out
    timers.current.push(setTimeout(() => setPhase('done'), 3400)) // 3.4s: home visible

    return clearTimers
  }, [])

  // Tapping anywhere during the splash skips it immediately.
  const skip = () => {
    clearTimers()
    setPhase('done')
  }

  if (phase === 'init' || phase === 'done') return null

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
        YourFamilyFarmer
      </h1>

      {/* Telugu name */}
      <p className="splash-te text-white mt-1" style={{ fontSize: 14 }}>
        యువర్ ఫ్యామిలీ ఫార్మర్
      </p>

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
