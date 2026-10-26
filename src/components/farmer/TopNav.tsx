'use client'

import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'

export default function TopNav({ regionSlug }: { regionSlug: string }) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <BackButton fallback={regionSlug ? `/region/${regionSlug}` : '/consumer'} tone="light" />
      <LanguageToggle variant="light" />
    </nav>
  )
}
