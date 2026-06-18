'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { L } = useLang()
  useEffect(() => {
    console.error('[YFF page error]', error.message)
  }, [error])

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">⚠️</div>
      <h1 className="text-2xl font-extrabold text-gray-900">{L('Something went wrong', 'ఏదో తప్పు జరిగింది. మళ్ళీ ప్రయత్నించండి.')}</h1>
      <div className="flex flex-col gap-2 mt-6 w-full max-w-xs">
        <button
          onClick={() => reset()}
          className="bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800"
        >
          {L('Try again', 'మళ్ళీ ప్రయత్నించండి')}
        </button>
        <Link
          href="/"
          className="border border-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm"
        >
          Go to home
        </Link>
      </div>
    </main>
  )
}
