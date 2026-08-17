'use client'

import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { useInstallState, runInstall, dismissInstall, DownloadIcon } from '@/lib/installPrompt'

/* Draggable "download the app" ball — an AssistiveTouch-style bubble the buyer
 * can move anywhere on screen, so it never sits on top of what they're reading.
 *
 * Starts bottom-LEFT: CartFab is `fixed right-4` at the same height, so the
 * right corner is taken. This runs on z-[55], one layer under it, and under
 * every modal.
 *
 * Position is remembered per device. The popover flips side and vertical
 * anchor based on where the ball has been dragged, so it can never open off
 * the edge of the screen. */

const SIZE = 56          // h-14 / w-14
const MARGIN = 8         // keep the ball this far from every edge
const POPOVER_W = 240    // w-60
const POS_KEY = 'yff_install_ball_pos'

type Pos = { x: number; y: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

function clampToViewport(p: Pos): Pos {
  return {
    x: clamp(p.x, MARGIN, Math.max(MARGIN, window.innerWidth - SIZE - MARGIN)),
    y: clamp(p.y, MARGIN, Math.max(MARGIN, window.innerHeight - SIZE - MARGIN)),
  }
}

/* Runs in the useState initialiser, i.e. during the hydration render. Safe:
   the component returns null until the store reports something to offer, so
   nothing derived from `window` reaches the server-rendered DOM. */
function initialPos(): Pos | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Pos
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return clampToViewport(p)
    }
  } catch { /* fall through to the default corner */ }
  return { x: 12, y: window.innerHeight - SIZE - 24 }
}

export default function InstallAppFab() {
  const { L } = useLang()
  const { canPrompt, iosHint } = useInstallState()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(initialPos)

  const ballRef = useRef<HTMLButtonElement>(null)
  // Drag bookkeeping lives in a ref: it changes on every pointermove and must
  // not re-render the page 60 times a second.
  const drag = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0, moved: 0 })

  // A rotation or a desktop resize can leave a remembered position off-screen.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampToViewport(p) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ballRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    drag.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      moved: 0,
    }
    // Keeps the moves coming even if the finger outruns the ball.
    el.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d.active) return
    d.moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
    setPos(clampToViewport({ x: e.clientX - d.dx, y: e.clientY - d.dy }))
  }

  const onPointerUp = () => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    // Under the threshold it was a tap, not a drag — a finger never holds
    // perfectly still, so an exact-zero test would make the ball untappable.
    if (d.moved < 8) {
      setOpen((v) => !v)
      return
    }
    if (pos) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* ignore */ } }
  }

  const install = async () => {
    setOpen(false)
    await runInstall()
  }

  if (!canPrompt && !iosHint) return null
  if (!pos) return null

  // Flip the popover so it always opens into the screen, never off it.
  const openLeft = pos.x > window.innerWidth / 2
  const openUp = pos.y > window.innerHeight / 2
  const popStyle: React.CSSProperties = {
    left: openLeft ? clamp(pos.x + SIZE - POPOVER_W, MARGIN, window.innerWidth - POPOVER_W - MARGIN) : clamp(pos.x, MARGIN, Math.max(MARGIN, window.innerWidth - POPOVER_W - MARGIN)),
    ...(openUp
      ? { bottom: window.innerHeight - pos.y + MARGIN }
      : { top: pos.y + SIZE + MARGIN }),
  }

  return (
    <>
      {/* Tap-away layer, mounted only while open so it never intercepts taps. */}
      {open && <div className="fixed inset-0 z-[54]" onClick={() => setOpen(false)} aria-hidden />}

      {open && (
        <div
          role="dialog"
          aria-label={L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్ డౌన్‌లోడ్')}
          className="fixed z-[56] w-60 rounded-2xl border border-green-200 bg-white p-3.5 shadow-2xl"
          style={popStyle}
        >
          <h3 className="text-green-900 font-extrabold text-sm leading-tight">
            {L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్')}
          </h3>
          <p className="text-green-800 text-xs mt-1 leading-snug">
            {iosHint
              ? L('Add it to your home screen.', 'హోమ్ స్క్రీన్‌కు జోడించండి.')
              : L('Add it to your phone. No Play Store needed.', 'మీ ఫోన్‌లో పెట్టుకోండి. ప్లే స్టోర్ అవసరం లేదు.')}
          </p>

          {iosHint ? (
            <ol className="mt-2.5 text-xs text-green-900 space-y-1 list-decimal list-inside">
              <li>{L('Tap Share', 'షేర్ నొక్కండి')} <span aria-hidden>⬆️</span></li>
              <li>{L('Choose "Add to Home Screen"', '"Add to Home Screen" ఎంచుకోండి')}</li>
            </ol>
          ) : (
            <button
              onClick={install}
              className="mt-3 w-full bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-800"
            >
              {L('Download App', 'డౌన్‌లోడ్ చేయండి')}
            </button>
          )}

          <button
            onClick={() => { setOpen(false); dismissInstall() }}
            className="mt-2 w-full text-green-700 text-xs font-semibold py-1 active:text-green-900"
          >
            {L("Don't show again", 'మళ్లీ చూపవద్దు')}
          </button>
        </div>
      )}

      <button
        ref={ballRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-expanded={open}
        aria-label={L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్ డౌన్‌లోడ్')}
        className="fixed z-[55] h-14 w-14 rounded-full bg-green-700 text-white shadow-2xl flex items-center justify-center active:bg-green-800"
        // touch-action:none is what makes the drag work on a phone — without it
        // the browser claims the gesture as a page scroll.
        style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
      >
        {!open && (
          <span
            className="absolute inset-0 rounded-full bg-green-500 opacity-60 animate-ping pointer-events-none"
            aria-hidden
          />
        )}
        <span className="relative flex items-center justify-center">
          {open ? <span className="text-2xl leading-none" aria-hidden>×</span> : <DownloadIcon />}
        </span>
      </button>
    </>
  )
}
