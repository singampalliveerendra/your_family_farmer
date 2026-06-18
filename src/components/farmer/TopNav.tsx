'use client'

import { useRouter } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'

export default function TopNav({ regionSlug }: { regionSlug: string }) {
  const { tx, L } = useLang()
  const router = useRouter()

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(regionSlug ? `/region/${regionSlug}` : '/consumer')
    }
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-gray-600 active:text-gray-900 min-h-[44px]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-medium">{tx.back}</span>
      </button>

      <LanguageToggle />
    </nav>
  )
}
