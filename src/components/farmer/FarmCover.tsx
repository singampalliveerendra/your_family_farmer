'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { normalizeUrl } from '@/lib/links'

type Farmer = {
  id: string
  name: string
  village: string
  district: string
  state: string
  farming_since_year: number
  cover_photo_url?: string | null
  photo_url?: string | null
  phone?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  youtube_url?: string | null
}

export default function FarmCover({
  farmer,
  initialFollowers = 0,
}: {
  farmer: Farmer
  initialFollowers?: number
}) {
  const { tx, L } = useLang()
  const { requireAuth } = useConsumerAuth()
  const [followed, setFollowed] = useState(false)
  const [followers, setFollowers] = useState(initialFollowers)
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  // Is the person looking at this public profile the farmer who owns it? Same
  // localStorage session the dashboard uses (see ProduceTab). Client-only, so
  // the server render is identical for everyone and nothing leaks to buyers.
  const [isOwner, setIsOwner] = useState(false)
  useEffect(() => {
    if (farmer.id && localStorage.getItem('yff_farmer_id') === farmer.id) setIsOwner(true)
  }, [farmer.id])

  // Load the live count + whether THIS consumer already follows (the count is
  // public; `following` is false when logged out).
  useEffect(() => {
    let cancelled = false
    fetch(`/api/farmer/${farmer.id}/follow`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return
        if (typeof j.count === 'number') setFollowers(j.count)
        setFollowed(!!j.following)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [farmer.id])

  // Follow/unfollow. Requires a logged-in consumer (so each person counts once);
  // an anonymous tap opens the login modal and then runs the toggle.
  const doToggle = useCallback(async () => {
    setBusy(true)
    const r = await fetch(`/api/farmer/${farmer.id}/follow`, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (r && r.ok && j) {
      setFollowed(!!j.following)
      if (typeof j.count === 'number') setFollowers(j.count)
    }
    setBusy(false)
  }, [farmer.id])

  const toggleFollow = () => requireAuth(() => { void doToggle() })

  // Only the channels the farmer actually filled in, each with a safe href.
  const socialLinks = ([
    { label: 'Facebook',  icon: '📘', raw: farmer.facebook_url },
    { label: 'Instagram', icon: '📸', raw: farmer.instagram_url },
    { label: 'YouTube',   icon: '▶️', raw: farmer.youtube_url },
  ] as const)
    .map((s) => ({ ...s, href: normalizeUrl(s.raw) }))
    .filter((s): s is typeof s & { href: string } => s.href !== null)

  const initials = farmer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Quick "Schedule a Visit" — opens WhatsApp to the farmer (same intent as the
  // detailed visit card in the Story tab), surfaced right next to the name.
  const whatsappVisitLink = farmer.phone
    ? `https://wa.me/${farmer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
        tx.visitWhatsApp.replace('{name}', farmer.name ?? ''),
      )}`
    : null

  return (
    <div className="relative">
      {/* Cover — real photo if uploaded, SVG illustration otherwise */}
      <div className="relative w-full h-44 sm:h-60 md:h-72 lg:h-80 bg-green-800 overflow-hidden">
        {farmer.cover_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={farmer.cover_photo_url}
            alt={`${farmer.name}'s farm`}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg viewBox="0 0 390 176" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            <rect width="390" height="176" fill="#1a4a1a" />
            <circle cx="320" cy="40" r="28" fill="#f9c74f" opacity="0.9" />
            <circle cx="320" cy="40" r="22" fill="#f9c74f" />
            {[0,45,90,135,180,225,270,315].map((angle, i) => (
              <line key={i}
                x1={320 + Math.cos((angle * Math.PI) / 180) * 26}
                y1={40 + Math.sin((angle * Math.PI) / 180) * 26}
                x2={320 + Math.cos((angle * Math.PI) / 180) * 36}
                y2={40 + Math.sin((angle * Math.PI) / 180) * 36}
                stroke="#f9c74f" strokeWidth="2.5"
              />
            ))}
            <rect x="0" y="130" width="390" height="46" fill="#2d5a1b" />
            <rect x="0" y="138" width="390" height="38" fill="#3a7a24" />
            <rect x="30" y="90" width="10" height="50" fill="#5c3d11" />
            <circle cx="35" cy="80" r="28" fill="#2d8a1f" />
            <circle cx="20" cy="90" r="18" fill="#33991f" />
            <circle cx="50" cy="88" r="20" fill="#267a18" />
            <rect x="340" y="95" width="10" height="45" fill="#5c3d11" />
            <circle cx="345" cy="82" r="26" fill="#2d8a1f" />
            <circle cx="330" cy="92" r="17" fill="#33991f" />
            <circle cx="358" cy="90" r="19" fill="#267a18" />
            {[0,1,2,3,4].map((i) => (
              <g key={i}>
                <line x1={120 + i * 32} y1="145" x2={120 + i * 32} y2="118" stroke="#4caf50" strokeWidth="2" />
                <ellipse cx={120 + i * 32} cy="116" rx="8" ry="12" fill="#66bb6a" />
                <ellipse cx={116 + i * 32} cy="122" rx="6" ry="9" fill="#81c784" />
                <ellipse cx={124 + i * 32} cy="121" rx="6" ry="9" fill="#81c784" />
              </g>
            ))}
            <rect x="165" y="110" width="60" height="35" fill="#8b6914" />
            <polygon points="155,112 195,88 235,112" fill="#a0522d" />
            <rect x="185" y="125" width="18" height="20" fill="#5c3d11" />
            <rect x="0" y="158" width="390" height="8" fill="#1565c0" opacity="0.6" />
            <rect x="0" y="159" width="390" height="4" fill="#42a5f5" opacity="0.4" />
          </svg>
        )}

        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-semibold text-green-800">
          {L('Natural farm', 'సహజ పొలం')} · {L('since', 'నుండి')} {farmer.farming_since_year}
        </div>
      </div>

      {/* Identity section */}
      <div className="bg-white px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Avatar — real photo if uploaded, initials otherwise */}
            <div className="flex-shrink-0 -mt-8">
              {farmer.photo_url ? (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="block rounded-full focus:outline-none"
                  aria-label="View full photo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={farmer.photo_url}
                    alt={farmer.name}
                    className="w-14 h-14 rounded-full object-cover border-3 border-white shadow-md"
                  />
                </button>
              ) : (
                <div className="w-14 h-14 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-lg border-3 border-white shadow-md">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900">{farmer.name}</h1>
              <p className="text-sm text-gray-500">
                {farmer.village}, {farmer.district}, {farmer.state}
              </p>
              {/* Phone, right under the name. Buyers kept asking how to reach
                  the farmer directly; the number was only in the Story tab's
                  WhatsApp link, which isn't obvious and isn't a phone call.
                  A tel: link so one tap dials on the phone this is built for. */}
              {farmer.phone && (
                <a
                  href={`tel:${farmer.phone.replace(/\D/g, '')}`}
                  className="inline-block text-sm font-semibold text-green-700 mt-0.5 active:opacity-70"
                >
                  📞 +91 {farmer.phone.replace(/\D/g, '').slice(-10)}
                </a>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2 mt-1">
            {/* Owner-only shortcut. A farmer who reaches their public page from
                the dashboard's "View profile" had no way back into editing
                except navigating to the dashboard and finding the link there.
                Deep-links straight into the profile modal. Replaces the
                Visit/Follow buttons, which are meaningless on your own page. */}
            {isOwner ? (
              <Link
                href="/farmer/dashboard?edit=profile"
                className="px-4 py-1.5 rounded-full text-sm font-semibold bg-green-700 text-white whitespace-nowrap active:bg-green-800"
              >
                ✏️ {tx.editProfile}
              </Link>
            ) : (
              <>
            {whatsappVisitLink && (
              <a
                href={whatsappVisitLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-1.5 rounded-full text-sm font-semibold bg-amber-500 text-white whitespace-nowrap active:bg-amber-600"
              >
                📅 {tx.scheduleVisit}
              </a>
            )}
            <button
              onClick={toggleFollow}
              disabled={busy}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all disabled:opacity-60 ${
                followed
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-green-700 border-green-700'
              }`}
            >
              {followed ? tx.following : tx.follow}
            </button>
              </>
            )}
            {/* Follower count — a plain number, shown to everyone. */}
            <span className="text-[11px] font-semibold text-gray-500">
              👥 {followers.toLocaleString('en-IN')} {followers === 1 ? L('follower', 'అనుచరుడు') : L('followers', 'అనుచరులు')}
            </span>
          </div>
        </div>

        {/* Farmer's own channels. A full-width row below the identity block
            rather than squeezed beside the name — at 390px the right-hand
            column is already carrying the Visit/Follow buttons. Renders nothing
            when the farmer has filled none in. Every href goes through
            normalizeUrl, so a stored value missing its scheme still leaves the
            site instead of resolving against our own domain, and a non-http
            string is dropped rather than linked. */}
        {socialLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {socialLinks.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 active:bg-gray-200"
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Full-size photo lightbox */}
      {lightbox && farmer.photo_url && (
        <button
          type="button"
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          aria-label="Close photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={farmer.photo_url}
            alt={farmer.name}
            className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
          />
        </button>
      )}
    </div>
  )
}
