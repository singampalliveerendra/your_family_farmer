'use client'

// Full-screen photo viewer with zoom (2026-11-18), so a buyer can read the
// small print on a pack label or a certificate photo.
//   • pinch with two fingers, or double-tap, to zoom (up to 5x)
//   • drag to move around a zoomed photo
//   • swipe left / right to change photo when not zoomed
//   • phone Back, ×, or Esc closes it
// The whole photo is shown (object-contain), never cropped like the gallery.
// Plain <img> on purpose: images are served unoptimized (see next.config.ts).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '@/lib/LanguageContext'
import { useBackToClose } from '@/lib/useBackToClose'
import {
  RESET, clampPan, clampZoom, containSize, distance, doubleTapZoom, swipeTarget, zoomAt,
  type ZoomState,
} from '@/lib/imageZoom'

type Pt = { x: number; y: number }

export default function ImageViewer({
  images,
  startIndex = 0,
  alt,
  onClose,
}: {
  images: string[]
  startIndex?: number
  alt: string
  onClose: () => void
}) {
  const { L } = useLang()
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, images.length - 1)))
  const [zoom, setZoom] = useState<ZoomState>(RESET)
  const [dragX, setDragX] = useState(0) // sideways swipe offset while not zoomed
  const [animate, setAnimate] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])
  const pointers = useRef(new Map<number, Pt>())
  const gesture = useRef<{
    mode: 'none' | 'swipe' | 'pan' | 'pinch'
    start: Pt
    startZoom: ZoomState
    startDist: number
    startMid: Pt
    moved: boolean
  }>({ mode: 'none', start: { x: 0, y: 0 }, startZoom: RESET, startDist: 1, startMid: { x: 0, y: 0 }, moved: false })
  const lastTap = useRef<{ t: number; p: Pt }>({ t: 0, p: { x: 0, y: 0 } })
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useBackToClose(true, onClose)

  // No page scroll underneath while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const go = useCallback((next: number) => {
    setAnimate(true)
    setZoom(RESET)
    setDragX(0)
    setIndex(Math.min(images.length - 1, Math.max(0, next)))
  }, [images.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, onClose])

  // Point relative to the centre of the viewer.
  const fromCentre = (clientX: number, clientY: number): Pt => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) }
  }

  const bounded = (s: ZoomState): ZoomState => {
    const r = stageRef.current?.getBoundingClientRect()
    const img = imgRefs.current[index]
    if (!r) return s
    const fit = containSize(img?.naturalWidth ?? 0, img?.naturalHeight ?? 0, r.width, r.height)
    return clampPan(s, fit, { w: r.width, h: r.height })
  }

  const midpoint = (): Pt => {
    const [a, b] = [...pointers.current.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, fromCentre(e.clientX, e.clientY))
    setAnimate(false)
    const g = gesture.current
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      g.mode = 'pinch'
      g.startZoom = zoomRef.current
      g.startDist = Math.max(1, distance(a, b))
      g.startMid = midpoint()
      g.moved = true
      setDragX(0)
    } else if (pointers.current.size === 1) {
      g.mode = zoomRef.current.scale > 1 ? 'pan' : 'swipe'
      g.start = fromCentre(e.clientX, e.clientY)
      g.startZoom = zoomRef.current
      g.moved = false
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = fromCentre(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const mid = midpoint()
      const scaled = zoomAt(g.startZoom, g.startZoom.scale * (distance(a, b) / g.startDist), g.startMid.x, g.startMid.y)
      // Moving both fingers together also drags the photo.
      setZoom(bounded({ ...scaled, x: scaled.x + (mid.x - g.startMid.x), y: scaled.y + (mid.y - g.startMid.y) }))
      return
    }
    const dx = p.x - g.start.x
    const dy = p.y - g.start.y
    if (Math.hypot(dx, dy) > 8) g.moved = true
    if (g.mode === 'pan') setZoom(bounded({ scale: g.startZoom.scale, x: g.startZoom.x + dx, y: g.startZoom.y + dy }))
    else if (g.mode === 'swipe' && images.length > 1) setDragX(dx)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = pointers.current.get(e.pointerId)!
    pointers.current.delete(e.pointerId)
    const g = gesture.current

    if (g.mode === 'pinch') {
      if (pointers.current.size === 1) {
        // One finger still down: carry on as a drag from where it is.
        const [rest] = [...pointers.current.values()]
        g.mode = zoomRef.current.scale > 1 ? 'pan' : 'none'
        g.start = rest
        g.startZoom = zoomRef.current
      } else {
        g.mode = 'none'
      }
      if (zoomRef.current.scale <= 1.02) { setAnimate(true); setZoom(RESET) }
      return
    }

    if (g.mode === 'swipe') {
      const r = stageRef.current?.getBoundingClientRect()
      const next = swipeTarget(index, p.x - g.start.x, images.length, r?.width ?? 0)
      setAnimate(true)
      setDragX(0)
      if (next !== index) go(next)
    }
    g.mode = 'none'

    // A tap (no real movement): two quick taps zoom in / out at that spot.
    if (!g.moved && e.type === 'pointerup') {
      const now = Date.now()
      if (now - lastTap.current.t < 300 && distance(lastTap.current.p, p) < 30) {
        setAnimate(true)
        setZoom(bounded(doubleTapZoom(zoomRef.current, p.x, p.y)))
        lastTap.current = { t: 0, p }
      } else {
        lastTap.current = { t: now, p }
      }
    }
  }

  // Mouse wheel / trackpad zoom on desktop.
  const onWheel = (e: React.WheelEvent) => {
    const p = fromCentre(e.clientX, e.clientY)
    setAnimate(false)
    setZoom((z) => bounded(zoomAt(z, clampZoom(z.scale * Math.exp(-e.deltaY * 0.002)), p.x, p.y)))
  }

  if (typeof document === 'undefined' || !images.length) return null

  const zoomed = zoom.scale > 1
  const ease = animate ? 'transform 220ms ease-out' : 'none'

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col select-none"
      role="dialog"
      aria-modal="true"
      aria-label={L('Photo viewer', 'ఫోటో వ్యూయర్')}
    >
      {/* Top bar: count + close */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 text-white">
        <span className="text-sm font-semibold tabular-nums">
          {images.length > 1 ? `${index + 1} / ${images.length}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white/15 active:bg-white/30 flex items-center justify-center text-2xl leading-none"
          aria-label={L('Close photo', 'ఫోటో మూసివేయండి')}
        >×</button>
      </div>

      {/* Photos */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className="flex h-full"
          style={{
            width: `${images.length * 100}%`,
            transform: `translateX(calc(${(-index * 100) / images.length}% + ${dragX}px))`,
            transition: ease,
          }}
        >
          {images.map((url, i) => (
            <div key={url + i} className="h-full flex items-center justify-center overflow-hidden" style={{ width: `${100 / images.length}%` }}>
              {/* Only the current photo and its neighbours load. */}
              {Math.abs(i - index) <= 1 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={(el) => { imgRefs.current[i] = el }}
                  src={url}
                  alt={images.length > 1 ? `${alt} (${i + 1}/${images.length})` : alt}
                  draggable={false}
                  decoding="async"
                  className="max-w-full max-h-full object-contain"
                  style={i === index ? {
                    transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                    transition: ease,
                    willChange: 'transform',
                  } : undefined}
                />
              )}
            </div>
          ))}
        </div>

        {/* Desktop arrows */}
        {images.length > 1 && index > 0 && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => go(index - 1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl items-center justify-center"
            aria-label={L('Previous photo', 'ముందు ఫోటో')}
          >‹</button>
        )}
        {images.length > 1 && index < images.length - 1 && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => go(index + 1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl items-center justify-center"
            aria-label={L('Next photo', 'తర్వాత ఫోటో')}
          >›</button>
        )}
      </div>

      {/* Hint + dots */}
      <div className="relative z-10 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 flex flex-col items-center gap-2 text-white/80">
        {images.length > 1 && (
          <div className="flex gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
            ))}
          </div>
        )}
        <p className="text-xs">
          {zoomed
            ? L('Double-tap to zoom out', 'జూమ్ తగ్గించడానికి రెండుసార్లు నొక్కండి')
            : L('Pinch or double-tap to zoom', 'జూమ్ చేయడానికి రెండు వేళ్లతో లాగండి లేదా రెండుసార్లు నొక్కండి')}
        </p>
      </div>
    </div>,
    document.body,
  )
}
