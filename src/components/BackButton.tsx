'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { canGoBack, readBackStack } from '@/lib/backNav'

const TONES = {
  // On the green page headers.
  dark: 'text-green-300 active:text-white',
  // On white / light bars.
  light: 'text-gray-600 active:text-gray-900',
} as const

/** What the Back button does, for screens with their own back arrow (the cart). */
export function useGoBack(): (fallback: string) => void {
  const router = useRouter()
  return (fallback) => {
    if (canGoBack(readBackStack())) router.back()
    else router.push(fallback)
  }
}

/**
 * The one Back button used across the app. Returns to the page the user came
 * from (browser history). When there is no page of ours behind this one — the
 * page was opened from a shared link, the home-screen icon or a new tab — it
 * goes to `fallback`, the page's natural parent, instead of leaving the app.
 *
 * Rendered as a link to `fallback`, so it still works before the JS loads.
 */
export default function BackButton({
  fallback,
  tone = 'dark',
  className = '',
}: {
  fallback: string
  tone?: keyof typeof TONES
  className?: string
}) {
  const { L } = useLang()
  const router = useRouter()

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let a ctrl/cmd-click open the fallback in a new tab as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (canGoBack(readBackStack())) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <Link
      href={fallback}
      onClick={onClick}
      className={`inline-flex items-center gap-1 min-h-[44px] -my-3 text-sm font-semibold ${TONES[tone]} ${className}`}
    >
      <span aria-hidden>←</span>
      {L('Back', 'వెనక్కు')}
    </Link>
  )
}
