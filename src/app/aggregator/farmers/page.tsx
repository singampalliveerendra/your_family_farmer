'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import SourceFarmersManager from '@/components/SourceFarmersManager'
import { requireFarmerSession } from '@/lib/farmer-auth-client'

// The aggregator's source-farmer registry, on its own page.
//
// It used to be a panel pinned to the top of the dashboard, on the reasoning
// that every harvest had to pick from it. That reasoning expired when the farmer
// selection moved to the produce form: the list is now consulted once per
// produce, not once per pick, so it is setup — and the client asked for it off
// the dashboard (2026-08-14). The dashboard keeps a link here.
//
// Auth mirrors the dashboard: the cookie decides (requireFarmerSession redirects
// a logged-out visitor to the login page), and a plain farmer who reaches this
// URL is sent to their own dashboard, since they have no farmers to aggregate.
export default function AggregatorFarmersPage() {
  const { L } = useLang()
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'ready'>('checking')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const farmerId = await requireFarmerSession()
      if (!farmerId || cancelled) return
      const { data } = await supabase
        .from('farmers')
        .select('account_type')
        .eq('id', farmerId)
        .maybeSingle()
      if (cancelled) return
      if (data?.account_type !== 'aggregator') { router.replace('/farmer/dashboard'); return }
      setState('ready')
    }
    void check()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-800 px-4 pt-5 pb-8">
        <Link href="/aggregator/dashboard" className="text-green-200 text-xs font-bold">
          ← {L('Dashboard', 'డాష్‌బోర్డ్')}
        </Link>
        <h1 className="text-white text-xl font-extrabold mt-2">
          {L('Farmers you aggregate from', 'మీరు సేకరించే రైతులు')}
        </h1>
        <p className="text-green-100 text-xs mt-1 leading-snug">
          {L(
            'Every produce you list names one of these farmers, and buyers see who grew what they bought.',
            'మీరు జాబితా చేసే ప్రతి ఉత్పత్తి ఈ రైతులలో ఒకరిని పేర్కొంటుంది, కొనుగోలుదారులు ఎవరు పండించారో చూస్తారు.',
          )}
        </p>
      </div>

      <div className="px-4 -mt-5 pb-10 max-w-md mx-auto">
        {state === 'checking' ? (
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
            <p className="text-sm text-gray-400">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
          </div>
        ) : (
          <SourceFarmersManager endpoint="/api/aggregator/source-farmers" />
        )}
      </div>
    </div>
  )
}
