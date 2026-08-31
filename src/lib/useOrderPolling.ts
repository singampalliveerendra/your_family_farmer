'use client'

import { useEffect, useRef } from 'react'

// Refresh-on-a-timer, replacing the Supabase realtime subscriptions the farmer
// and consumer order screens used to hold.
//
// WHY THIS EXISTS
// Realtime is delivered by Postgres logical replication and is filtered by the
// subscriber's own permissions: a role that cannot SELECT a table receives no
// changes for it. Once `orders` stopped being readable by the anon key, every
// postgres_changes subscription on it went silent — and silently, with no error
// on the channel, which is the worst possible failure mode for "the farmer
// never saw the order". Keeping a narrow anon SELECT alive just for realtime
// would have re-opened the leak we closed (order volume and status per farmer
// is still business data).
//
// So: poll the authenticated endpoint instead. On a slow 4G connection an
// interval this size is cheap — the responses are small JSON — and pausing
// while the tab is hidden means a backgrounded dashboard costs nothing.
const DEFAULT_INTERVAL_MS = 25_000

/**
 * Calls `onTick` every `intervalMs` while the tab is visible, and once
 * immediately whenever the tab becomes visible again (so a farmer returning to
 * a backgrounded dashboard sees current data without waiting out the interval).
 *
 * `onTick` is held in a ref, so callers may pass an inline closure without
 * restarting the timer on every render.
 */
export function useOrderPolling(
  onTick: () => void | Promise<void>,
  enabled: boolean,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  const tickRef = useRef(onTick)
  useEffect(() => { tickRef.current = onTick }, [onTick])

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null

    const fire = () => { void tickRef.current() }

    const start = () => {
      if (timer !== null) return
      timer = setInterval(fire, intervalMs)
    }
    const stop = () => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fire()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs])
}
