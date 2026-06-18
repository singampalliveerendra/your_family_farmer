'use client'

import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'

export default function NotFound() {
  const { L } = useLang()
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">🌾</div>
      <h1 className="text-2xl font-extrabold text-gray-900">{L('Page not found', 'ఈ పేజీ కనుగొనబడలేదు')}</h1>
      <Link
        href="/"
        className="mt-6 bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm active:bg-green-800"
      >
        {L('Go to home', 'హోమ్‌కు వెళ్ళండి')}
      </Link>
    </main>
  )
}
