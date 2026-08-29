'use client'

import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { useHomeTheme, setHomeTheme, type HomeTheme } from '@/lib/homeTheme'

/* The gear in the /home header.
 *
 * A popover rather than the full-screen bottom sheet the install CTA uses:
 * that pattern is for a decision the visitor has to finish, this is a
 * preference they flip and dismiss. A sheet for one setting reads as a much
 * bigger interruption than it is.
 *
 * The language pill stays in the header rather than moving in here. Language
 * is not a preference on this page — it is the first thing a visitor has to
 * settle before any of the copy means anything, so it has to be visible
 * without opening a menu.
 */

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  )
}

export default function HomeSettings() {
  const { L } = useLang()
  const theme = useHomeTheme()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  /* Dismiss on an outside tap or Escape. Bound only while the panel is open,
     so the page carries no idle document listeners. `mousedown` rather than
     `click`: a click that starts inside the panel and ends outside — a drag
     off a button — should not count as dismissing it. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choice = (value: HomeTheme, icon: React.ReactNode, label: string) => {
    const active = theme === value
    return (
      <button
        type="button"
        onClick={() => setHomeTheme(value)}
        aria-pressed={active}
        className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
          active
            ? 'bg-lime-400 text-green-950 shadow-sm dark:bg-lime-300'
            : 'text-green-900/60 hover:bg-green-900/5 dark:text-lime-100/60 dark:hover:bg-white/5'
        }`}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={L('Settings', 'సెట్టింగ్‌లు')}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-green-900/12 bg-white text-green-900/70 shadow-sm transition hover:border-lime-600/40 hover:text-green-950 dark:border-white/15 dark:bg-white/5 dark:text-lime-100 dark:shadow-none dark:hover:border-lime-300/50 dark:hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
             strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={L('Settings', 'సెట్టింగ్‌లు')}
          /* Right-anchored so it can never push the 390px header sideways. */
          className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-green-900/10 bg-white p-3 text-left shadow-xl dark:border-lime-300/20 dark:bg-[#081a10] dark:shadow-2xl"
        >
          <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-green-900/45 dark:text-lime-100/45">
            {L('Appearance', 'రూపం')}
          </p>
          <div className="flex gap-1 rounded-2xl bg-green-900/5 p-1 dark:bg-white/5">
            {choice('light', <SunIcon className="h-4 w-4 shrink-0" />, L('Light', 'లైట్'))}
            {choice('dark', <MoonIcon className="h-4 w-4 shrink-0" />, L('Dark', 'డార్క్'))}
          </div>
        </div>
      )}
    </div>
  )
}
