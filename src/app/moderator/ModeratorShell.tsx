'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

type NavItem = { label: string; href: string; ready: boolean }

// The 9 sections from the spec. Only the ones built so far route anywhere;
// the rest are shown greyed with a "soon" tag so the full shape is visible.
const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/moderator', ready: true },
  { label: 'Farmer onboarding', href: '/moderator/farmers', ready: true },
  { label: 'My farmers', href: '/moderator/my-farmers', ready: true },
  { label: 'Escalations', href: '/moderator/escalations', ready: true },
  { label: 'Listings', href: '/moderator/listings', ready: true },
  { label: 'Consumers', href: '/moderator/consumers', ready: true },
  { label: 'Delivery agents', href: '/moderator/agents', ready: true },
  { label: 'Price management', href: '/moderator/prices', ready: true },
  { label: 'Supply & demand', href: '/moderator/supply', ready: true },
  { label: 'Reports', href: '/moderator/reports', ready: true },
]

export default function ModeratorShell({
  title,
  subtitle,
  zone,
  children,
}: {
  title: string
  subtitle?: string
  zone: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const logout = async () => {
    await fetch('/api/moderator/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    router.replace('/moderator/login')
  }

  const zoneLabel = zone.charAt(0).toUpperCase() + zone.slice(1)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed md:static z-30 inset-y-0 left-0 w-60 bg-green-950 text-green-50 flex-col transition-transform ${
          menuOpen ? 'flex translate-x-0' : 'hidden md:flex md:translate-x-0'
        }`}
      >
        <div className="px-5 pt-6 pb-5 border-b border-green-900/60">
          <p className="text-lg font-extrabold tracking-tight text-white">GoGrameen</p>
          <p className="text-[11px] text-green-300/80">Moderator · {zoneLabel}</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((item) => {
            const active = pathname === item.href
            if (!item.ready) {
              return (
                <div
                  key={item.href}
                  className="flex items-center justify-between px-5 py-2.5 text-sm text-green-300/40 cursor-not-allowed"
                >
                  <span>{item.label}</span>
                  <span className="text-[9px] uppercase bg-green-900/50 px-1.5 py-0.5 rounded">soon</span>
                </div>
              )
            }
            return (
              <button
                key={item.href}
                onClick={() => { setMenuOpen(false); router.push(item.href) }}
                className={`w-full text-left px-5 py-2.5 text-sm transition-colors ${
                  active ? 'bg-green-800 text-white font-semibold border-l-4 border-green-300' : 'text-green-100 hover:bg-green-900/60'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
        <button onClick={logout} className="px-5 py-4 text-xs text-green-300 hover:text-white text-left border-t border-green-900/60">
          Log out
        </button>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setMenuOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-gray-100 px-4 md:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMenuOpen(true)} className="md:hidden text-gray-700 text-xl leading-none">☰</button>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-extrabold text-gray-900 leading-tight truncate">{title}</h1>
              {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <span className="text-[11px] font-semibold bg-green-100 text-green-800 px-3 py-1 rounded-full whitespace-nowrap">
            {zoneLabel} zone
          </span>
        </header>
        <main className="p-4 md:p-8 max-w-5xl">{children}</main>
      </div>
    </div>
  )
}

// Shared client-side auth guard. Returns the zone once confirmed, or redirects
// to /moderator/login. Every moderator page uses this so a farmer / consumer /
// rider who lands on a /moderator URL is bounced out immediately.
export function useModeratorAuth() {
  const router = useRouter()
  const [zone, setZone] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/moderator/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json?.moderator) { setZone(json.zone); setChecked(true) }
        else router.replace('/moderator/login')
      })
      .catch(() => { if (!cancelled) router.replace('/moderator/login') })
    return () => { cancelled = true }
  }, [router])

  return { zone, checked }
}
