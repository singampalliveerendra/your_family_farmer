'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Entry = {
  id: string
  table_name: string
  record_id: string | null
  action: 'insert' | 'update' | 'delete'
  actor_type: string
  actor_id: string | null
  changes: Record<string, unknown> | null
  region_slug: string | null
  created_at: string
}

// Friendly names for the tables we audit.
const TABLE_LABEL: Record<string, string> = {
  farmers: 'Farmer',
  produce_listings: 'Listing',
  escalations: 'Complaint',
  consumers_auth: 'Consumer',
  demand_intents: 'Demand request',
  reviews: 'Review',
}

const ACTION_STYLE: Record<string, string> = {
  insert: 'bg-green-100 text-green-700',
  update: 'bg-amber-100 text-amber-700',
  delete: 'bg-red-100 text-red-600',
}
const ACTION_LABEL: Record<string, string> = { insert: 'Created', update: 'Edited', delete: 'Deleted' }

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    })
  } catch { return iso }
}

// Best-effort human label for a changed row — the name/crop if the snapshot
// carried one, else the short record id.
function entryTitle(e: Entry): string {
  const c = e.changes ?? {}
  const pick = (k: string): string | null => {
    const v = c[k]
    if (typeof v === 'string' && v.trim()) return v
    // update entries store { old, new } per field
    if (v && typeof v === 'object' && 'new' in (v as object)) {
      const nv = (v as { new: unknown }).new
      if (typeof nv === 'string' && nv.trim()) return nv
    }
    return null
  }
  return pick('name') || pick('crop_name') || pick('description')
    || (e.record_id ? `#${e.record_id.slice(0, 8)}` : '—')
}

function changedFields(e: Entry): string[] {
  if (e.action !== 'update' || !e.changes) return []
  return Object.keys(e.changes)
}

export default function ModeratorAuditPage() {
  const { zone, checked } = useModeratorAuth()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/audit', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load audit log.'); return }
    setEntries((json.entries ?? []) as Entry[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const tables = useMemo(
    () => Array.from(new Set(entries.map((e) => e.table_name))),
    [entries],
  )
  const shown = filter === 'all' ? entries : entries.filter((e) => e.table_name === filter)

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Audit log" subtitle="Every create, edit and delete in your zone" zone={zone}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap mb-4">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label={`All · ${entries.length}`} />
        {tables.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)} label={TABLE_LABEL[t] ?? t} />
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">🗒️</div>
          <p className="font-semibold text-gray-500 text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((e) => {
            const fields = changedFields(e)
            const isOpen = expanded === e.id
            return (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <button
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                  className="w-full text-left flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLE[e.action]}`}>
                        {ACTION_LABEL[e.action] ?? e.action}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {TABLE_LABEL[e.table_name] ?? e.table_name}
                      </span>
                      <span className="text-[10px] text-gray-400">by {e.actor_type}</span>
                    </div>
                    <p className="font-bold text-gray-900 text-sm mt-1 truncate">{entryTitle(e)}</p>
                    {e.action === 'update' && fields.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                        Changed: {fields.join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtWhen(e.created_at)}</span>
                </button>

                {isOpen && e.changes && (
                  <pre className="mt-3 text-[11px] bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700 whitespace-pre-wrap break-all">
                    {JSON.stringify(e.changes, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </ModeratorShell>
  )
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
        active ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200'
      }`}
    >
      {label}
    </button>
  )
}
