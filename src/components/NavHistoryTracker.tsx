'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { nextBackStack, isSameOriginReferrer, readBackStack, writeBackStack } from '@/lib/backNav'

/**
 * Invisible. Records each in-app page visit so the Back button knows whether
 * there is a page of ours behind the current one (see src/lib/backNav.ts).
 * Mounted once from the root layout.
 */
export default function NavHistoryTracker() {
  const pathname = usePathname()
  const lastLength = useRef<number | null>(null)

  useEffect(() => {
    if (!pathname) return
    const len = window.history.length
    let stack: string[]
    if (lastLength.current === null) {
      // First render of this page load.
      stack = isSameOriginReferrer(document.referrer, window.location.origin) ? readBackStack() : []
      stack = nextBackStack(stack, pathname, true)
    } else {
      stack = nextBackStack(readBackStack(), pathname, len > lastLength.current)
    }
    lastLength.current = len
    writeBackStack(stack)
  }, [pathname])

  return null
}
