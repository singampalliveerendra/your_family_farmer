'use client'

import { useEffect, useRef } from 'react'
import { overlayStepGone } from '@/lib/overlayHistory'

/* Phone Back (and the browser's Back) closes the overlay on top — the produce
 * form, its Preview, an edit sheet — instead of leaving the page underneath
 * (2026-11-05: Back from Preview went to the consumer dashboard and the whole
 * new-produce form was lost).
 *
 * While `open`, the overlay owns one history step (same URL, so the page and
 * every typed value stay exactly as they are). Back removes that step and
 * closes just this overlay; overlays stack (form → preview → Back → form).
 * Closing it any other way (×, Save) takes the step back off, so Back never
 * needs pressing twice.
 *
 * The removal waits one tick and is cancelled if the same overlay mounts again
 * at once (React's development double-mount, a fast re-render) — otherwise its
 * own history.back() would close it. Call it inside the overlay component, or
 * with its open flag. */

let seq = 0
type Entry = { id: number; timer: ReturnType<typeof setTimeout> | null; closedByBack: boolean }

export function useBackToClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  const entryRef = useRef<Entry | null>(null)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    let entry = entryRef.current
    if (entry && entry.timer) {
      // Mounted again straight after an unmount: keep the step it already owns.
      clearTimeout(entry.timer)
      entry.timer = null
    } else {
      entry = { id: ++seq, timer: null, closedByBack: false }
      entryRef.current = entry
      // Keep the router's own state (Next.js reads it on popstate) and add ours.
      window.history.pushState({ ...(window.history.state ?? {}), yffOverlay: entry.id }, '')
    }
    const mine = entry
    const onPop = () => {
      if (!mine.closedByBack && overlayStepGone(window.history.state, mine.id)) {
        mine.closedByBack = true
        closeRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (mine.closedByBack) { entryRef.current = null; return }
      // Closed from the UI: remove the step this overlay added (unless it comes straight back).
      mine.timer = setTimeout(() => {
        entryRef.current = null
        if ((window.history.state as { yffOverlay?: number } | null)?.yffOverlay === mine.id) window.history.back()
      }, 0)
    }
  }, [open])
}
