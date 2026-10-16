'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import { useLang } from '@/lib/LanguageContext'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { formatDistance } from '@/lib/location'
import { rankFarmers, type FarmerCard, type RankedFarmer } from '@/lib/farmersTab'

// The Farmers tab: who you buy from. The farmers you follow come first, then
// everyone else, nearest first once a location is set on the home page. This is
// what sets the app apart from a plain shop — buyers know their farmer.
export default function ConsumerFarmersPage() {
  const { L } = useLang()
  const { state, openAuth } = useConsumerAuth()
  const [farmers, setFarmers] = useState<FarmerCard[] | null>(null)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  // The location the buyer set on the home page (same keys it writes).
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    try {
      const lat = Number(localStorage.getItem('yff_consumer_lat'))
      const lng = Number(localStorage.getItem('yff_consumer_lng'))
      if (lat && lng) setOrigin({ lat, lng })
    } catch { /* storage blocked */ }
  }, [])

  // The farmer list is the same for everyone (CDN-cached), so it loads once.
  useEffect(() => {
    let cancelled = false
    fetch('/api/consumer/farmers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (!cancelled) setFarmers(Array.isArray(j?.farmers) ? j.farmers : []) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  // Who this buyer follows is personal: asked only once signed in, and again on
  // sign-in so "Farmers you follow" fills in without a reload.
  useEffect(() => {
    if (state.status !== 'authenticated') { setFollowingIds([]); return }
    let cancelled = false
    fetch('/api/consumer/follows', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && Array.isArray(j?.followingIds)) setFollowingIds(j.followingIds) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [state.status])

  const { following, others } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (farmers ?? []).filter((f) =>
      !q || [f.name, f.village, f.district].some((v) => v?.toLowerCase().includes(q)),
    )
    return rankFarmers(list, followingIds, origin)
  }, [farmers, followingIds, origin, query])

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-green-900 px-4 pt-6 pb-12">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer" className="text-green-300 text-sm">{L('← Back', 'వెనక్కు')}</Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">{L('Your farmers', 'మీ రైతులు')}</h1>
        <p className="text-green-400 text-sm mt-1">
          {L('Know who grows your food. Follow a farmer to see them here first.', 'మీ ఆహారం ఎవరు పండిస్తారో తెలుసుకోండి. రైతును ఫాలో చేస్తే ఇక్కడ ముందు కనిపిస్తారు.')}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-7 space-y-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={L('Search farmer or village', 'రైతు లేదా ఊరు వెతకండి')}
          className="w-full bg-white rounded-2xl shadow-md px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-green-600"
        />

        {failed ? (
          <p className="text-sm text-center text-gray-500 py-10">{L('Could not load farmers. Check your connection.', 'రైతులను లోడ్ చేయలేకపోయాం. కనెక్షన్ చూడండి.')}</p>
        ) : farmers === null ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[76px] bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-[11px] font-bold text-green-800 uppercase tracking-wide mb-2">
                ❤️ {L('Farmers you follow', 'మీరు ఫాలో చేసే రైతులు')}
              </h2>
              {following.length > 0 ? (
                <FarmerList farmers={following} />
              ) : (
                <div className="bg-white rounded-2xl border border-dashed border-green-300 p-4 text-sm text-gray-600 leading-snug">
                  {state.status === 'authenticated' ? (
                    L('You don’t follow anyone yet. Open a farmer below and tap Follow.', 'మీరు ఇంకా ఎవరినీ ఫాలో చేయలేదు. కింద ఒక రైతును తెరిచి Follow నొక్కండి.')
                  ) : (
                    <>
                      {L('Log in to follow farmers and see them here.', 'రైతులను ఫాలో చేయడానికి లాగిన్ అవ్వండి.')}{' '}
                      <button onClick={() => openAuth()} className="font-bold text-green-700 underline">{L('Log in', 'లాగిన్')}</button>
                    </>
                  )}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-[11px] font-bold text-green-800 uppercase tracking-wide mb-2">
                📍 {origin ? L('Farmers near you', 'మీ దగ్గర రైతులు') : L('All farmers', 'అందరు రైతులు')}
              </h2>
              {others.length > 0 ? (
                <FarmerList farmers={others} />
              ) : (
                <p className="text-sm text-center text-gray-500 py-6">{L('No farmers found.', 'రైతులు కనిపించలేదు.')}</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function FarmerList({ farmers }: { farmers: RankedFarmer[] }) {
  const { L } = useLang()
  return (
    <ul className="space-y-2.5">
      {farmers.map((f) => {
        const aggregator = f.account_type === 'aggregator'
        const place = [f.village, f.district].filter(Boolean).join(', ')
        return (
          <li key={f.id}>
            <Link
              href={`/farmer/${f.slug}`}
              className="flex items-start gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 active:scale-[0.98] active:bg-gray-50 transition-transform"
            >
              <span className="w-[52px] h-[52px] rounded-full bg-green-100 flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl">
                {f.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.photo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span aria-hidden>{aggregator ? '🤝' : '👨‍🌾'}</span>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold text-gray-900 truncate">{f.name}</span>
                {place && <span className="block text-xs text-gray-500 truncate">{place}</span>}
                {f.grow_text && (
                  <span className="block mt-1.5 bg-green-50 rounded-lg px-2 py-1.5">
                    <span className="block text-[10px] font-bold text-green-700 uppercase tracking-wide">
                      {f.grow_source === 'aggregate'
                        ? `🤝 ${L('How we aggregate', 'మేము ఎలా సేకరిస్తాము')}`
                        : f.grow_source === 'story'
                          ? `📖 ${L('Our story', 'మా కథ')}`
                          : `🌱 ${L('How we grow', 'మేము ఎలా పండిస్తాము')}`}
                    </span>
                    <span className="text-xs text-gray-700 leading-snug line-clamp-2">{f.grow_text}</span>
                  </span>
                )}
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[11px] text-gray-500 whitespace-nowrap">
                  {f.rating_avg ? <span className="font-bold text-amber-600">★ {Number(f.rating_avg).toFixed(1)}</span> : null}
                  <span>{f.listing_count} {L(f.listing_count === 1 ? 'item' : 'items', 'వస్తువులు')}</span>
                  {f.follower_count > 0 && <span>· {f.follower_count} {L(f.follower_count === 1 ? 'follower' : 'followers', 'ఫాలోయర్లు')}</span>}
                  {aggregator && <span className="text-green-700 font-semibold">· {L('Aggregator', 'సమీకరణదారు')}</span>}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1 flex-shrink-0">
                {f.distanceKm != null && (
                  <span className="text-[11px] font-bold text-green-800 bg-green-50 rounded-full px-2 py-0.5">{formatDistance(f.distanceKm, L)}</span>
                )}
                <span className="text-gray-300 text-xl leading-none">›</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
