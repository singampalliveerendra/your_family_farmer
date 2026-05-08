'use client'

import { useState, useRef, useEffect } from 'react'

type Suggestion = {
  name: string
  subtitle: string
  lat: number
  lng: number
}

// AP + Telangana bbox: min_lon,min_lat,max_lon,max_lat
const BBOX = '76.0,12.0,85.5,20.5'

// States we allow in results
const ALLOWED_STATES = ['andhra pradesh', 'telangana']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePhoton(data: any): Suggestion[] {
  const seen = new Set<string>()
  const results: Suggestion[] = []

  for (const feature of data?.features ?? []) {
    const p = feature?.properties ?? {}
    const coords: [number, number] = feature?.geometry?.coordinates ?? [0, 0]
    const lng = coords[0]
    const lat = coords[1]

    if (!lat || !lng) continue

    // Filter to AP + Telangana only
    const state: string = (p.state ?? '').toLowerCase()
    if (state && !ALLOWED_STATES.some((s) => state.includes(s))) continue

    // Best name for this result
    const name: string = (
      p.name || p.city || p.town || p.village || p.hamlet || p.suburb || p.county || ''
    ).trim()
    if (!name) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const parts: string[] = []
    const district = p.county || p.district || p.state_district
    if (district && district.toLowerCase() !== key) parts.push(district)
    if (p.state) parts.push(p.state)

    results.push({ name, subtitle: parts.join(', '), lat, lng })
  }

  return results
}

async function fetchSuggestions(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '8')
  url.searchParams.set('bbox', BBOX)
  url.searchParams.set('lang', 'en')

  // 8s hard timeout — Photon hangs on slow Indian 4G otherwise.
  // Combine the parent abort + a local timeout into one signal.
  const ctrl = new AbortController()
  const onParentAbort = () => ctrl.abort()
  signal.addEventListener('abort', onParentAbort)
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parsePhoton(await res.json())
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onParentAbort)
  }
}

export default function LocationSearch({
  placeholder = 'Search city, town or village... / పట్టణం వెతకండి',
  onSelect,
  initialValue = '',
}: {
  placeholder?: string
  onSelect: (lat: number, lng: number, name: string) => void
  initialValue?: string
}) {
  const [query, setQuery]             = useState(initialValue)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading]         = useState(false)
  const [showDrop, setShowDrop]       = useState(false)
  const [noResults, setNoResults]     = useState(false)
  const [dropUp, setDropUp]           = useState(false)
  const abortRef     = useRef<AbortController | null>(null)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const doSearch = async (q: string) => {
    abortRef.current?.abort()
    const clean = q.trim()
    if (clean.length < 2) {
      setSuggestions([])
      setNoResults(false)
      setLoading(false)
      setShowDrop(false)
      return
    }
    abortRef.current = new AbortController()
    setLoading(true)
    setNoResults(false)
    try {
      const results = await fetchSuggestions(clean, abortRef.current.signal)
      setSuggestions(results)
      setNoResults(results.length === 0)
      setShowDrop(true)
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setSuggestions([])
        setNoResults(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(val), 350)
    if (val.trim().length < 2) {
      setSuggestions([])
      setNoResults(false)
      setShowDrop(false)
    }
  }

  const handleSelect = (s: Suggestion) => {
    setQuery(s.name)
    setSuggestions([])
    setShowDrop(false)
    setNoResults(false)
    onSelect(s.lat, s.lng, s.name)
  }

  const handleClear = () => {
    setQuery('')
    setSuggestions([])
    setShowDrop(false)
    setNoResults(false)
    abortRef.current?.abort()
  }

  // Flip dropdown upward when the keyboard shrinks the visual viewport and
  // leaves insufficient space below the input to show results
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      // Pixels available between the bottom of the input and the top of the keyboard
      const spaceBelow = vv.height + vv.offsetTop - rect.bottom
      setDropUp(spaceBelow < 220)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (suggestions.length > 0) setShowDrop(true) }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full border-2 border-gray-200 rounded-xl pl-9 pr-9 py-3 text-base focus:border-green-500 focus:outline-none bg-white"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full" />
          </span>
        )}
        {!loading && query && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleClear() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDrop && suggestions.length > 0 && (
        <div className={`absolute z-30 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
              className="w-full text-left px-4 py-3 hover:bg-green-50 active:bg-green-100 border-b border-gray-100 last:border-0"
            >
              <p className="font-semibold text-sm text-gray-900 leading-snug">📍 {s.name}</p>
              {s.subtitle && (
                <p className="text-xs text-gray-500 mt-0.5">{s.subtitle}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {showDrop && noResults && !loading && (
        <div className={`absolute z-30 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-4 text-center ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <p className="text-sm font-semibold text-gray-600">
            No results / ఫలితాలు లేవు
          </p>
          <p className="text-xs text-gray-400 mt-1 leading-snug">
            Try the full name or a nearby larger town<br />
            పూర్తి పేరు లేదా దగ్గరలోని పెద్ద పట్టణం వెతకండి
          </p>
        </div>
      )}
    </div>
  )
}
