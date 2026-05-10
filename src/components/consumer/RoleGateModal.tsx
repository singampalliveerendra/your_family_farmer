'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLE_KEY = 'yff_role'

export default function RoleGateModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Mount: open the modal if the visitor hasn't picked a role yet. Done in a
  // useEffect so SSR doesn't render anything (avoids hydration mismatch).
  useEffect(() => {
    try {
      const existing = localStorage.getItem(ROLE_KEY)
      if (!existing) setOpen(true)
    } catch {
      // localStorage might be blocked in private modes — just skip the gate.
    }
  }, [])

  if (!open) return null

  const choose = (role: 'consumer' | 'farmer') => {
    try { localStorage.setItem(ROLE_KEY, role) } catch { /* ignore */ }
    setOpen(false)
    if (role === 'farmer') router.push('/farmer/dashboard')
  }

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 flex items-end sm:items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-5 shadow-2xl">
        <div className="text-center space-y-1">
          <p className="text-3xl">🌿</p>
          <h2 className="text-lg font-extrabold text-gray-900 leading-tight">
            Welcome to YourFamilyFarmer
          </h2>
          <p className="text-sm text-gray-500">
            యువర్ ఫ్యామిలీ ఫార్మర్‌కి స్వాగతం
          </p>
        </div>

        <p className="text-sm text-gray-700 text-center leading-snug">
          Tell us how you&apos;d like to start.<br />
          మీరు ఎలా ప్రారంభించాలనుకుంటున్నారు?
        </p>

        <div className="space-y-3">
          <button
            onClick={() => choose('consumer')}
            className="w-full bg-green-700 text-white font-extrabold py-4 rounded-2xl text-base active:bg-green-800 flex items-center justify-center gap-2 leading-tight"
          >
            🛒 I&apos;m a Buyer<br />
            <span className="font-semibold text-sm opacity-90">నేను కొనుగోలుదారుని</span>
          </button>
          <button
            onClick={() => choose('farmer')}
            className="w-full bg-amber-600 text-white font-extrabold py-4 rounded-2xl text-base active:bg-amber-700 flex items-center justify-center gap-2 leading-tight"
          >
            🧑‍🌾 I&apos;m a Farmer<br />
            <span className="font-semibold text-sm opacity-90">నేను రైతుని</span>
          </button>
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          You can switch roles anytime from the top menu.<br />
          ఎప్పుడైనా పైన ఉన్న మెనూ నుండి మార్చవచ్చు.
        </p>
      </div>
    </div>
  )
}
