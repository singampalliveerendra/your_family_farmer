'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Tiny landing: send rider straight to dashboard if they have a session,
// otherwise to the login page. Keeps /rider as a single entry URL.
export default function RiderLandingPage() {
  const router = useRouter()
  useEffect(() => {
    let cancelled = false
    fetch('/api/rider/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json?.rider?.id) router.replace('/rider/dashboard')
        else router.replace('/rider/login')
      })
      .catch(() => { if (!cancelled) router.replace('/rider/login') })
    return () => { cancelled = true }
  }, [router])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
    </main>
  )
}
