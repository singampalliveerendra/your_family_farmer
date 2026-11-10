'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'
import PlanCard from '@/components/PlanCard'
import {
  PLAN_KINDS,
  PLAN_KIND_LABELS,
  isPlanRowKind,
  accessOf,
  inr,
  validatePlan,
  type PlanKind,
  type PlanRow,
  type PlanRowKind,
  type SubscriptionRow,
} from '@/lib/subscriptionPlans'
import { HIDE_AFTER_DAYS, hideDue, standingOf } from '@/lib/subscriptionLifecycle'

// Moderator → Subscriptions (decision 2026-11-04). Moderators are the
// super-users for now, so this screen is platform-wide, not per zone.
//   Plans: exactly two, Buying and Selling (client card 2026-11-10). No adding
//          or deleting — edit price, duration, offer on/off and end date,
//          ₹0 = free, show/hide. The card on the right of the form is exactly
//          what /home/aggregator shows. They come from two-plans-migration.sql.
//   Aggregators: who holds what; activate by hand for N days, Free forever,
//          or switch a subscription off.
// English only, like the rest of the moderator area.

type Aggregator = { id: string; name: string; village: string | null; phone: string | null; active: boolean; created_at: string }
type Sub = SubscriptionRow & { aggregator_id: string; note?: string | null; paid_at?: string | null; receipt_no?: string | null; payment_label?: string | null }

type Form = {
  id: string
  kind: PlanRowKind
  name_en: string
  name_te: string
  duration: '30' | '365' | 'custom'
  customDays: string
  actual_price: string
  offer_enabled: boolean
  offer_price: string
  offer_end_date: string // yyyy-mm-dd (India), '' = no end
  offer_label_en: string
  offer_label_te: string
  highlights_en: string
  highlights_te: string
  active: boolean
  sort_order: string
}

/** The India date of an instant, as yyyy-mm-dd for <input type="date">. */
function istDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

function formFromPlan(p: PlanRow): Form {
  const days = Number(p.duration_days)
  return {
    id: p.id,
    kind: isPlanRowKind(p.kind) ? p.kind : 'buying',
    name_en: p.name_en ?? '',
    name_te: p.name_te ?? '',
    duration: days === 30 ? '30' : days === 365 ? '365' : 'custom',
    customDays: days === 30 || days === 365 ? '' : String(days),
    actual_price: String(p.actual_price ?? ''),
    offer_enabled: !!p.offer_enabled,
    offer_price: p.offer_price == null ? '' : String(p.offer_price),
    offer_end_date: istDate(p.offer_ends_at),
    offer_label_en: p.offer_label_en ?? '',
    offer_label_te: p.offer_label_te ?? '',
    highlights_en: p.highlights_en ?? '',
    highlights_te: p.highlights_te ?? '',
    active: p.active !== false,
    sort_order: String(p.sort_order ?? 0),
  }
}

/** What the API gets. The offer ends at the END of the chosen India day. */
function bodyOf(f: Form) {
  return {
    kind: f.kind,
    name_en: f.name_en,
    name_te: f.name_te,
    duration_days: f.duration === 'custom' ? Number(f.customDays) : Number(f.duration),
    actual_price: f.actual_price === '' ? '' : Number(f.actual_price),
    offer_enabled: f.offer_enabled,
    offer_price: f.offer_price === '' ? null : Number(f.offer_price),
    offer_ends_at: f.offer_end_date ? `${f.offer_end_date}T23:59:59+05:30` : null,
    offer_label_en: f.offer_label_en,
    offer_label_te: f.offer_label_te,
    highlights_en: f.highlights_en,
    highlights_te: f.highlights_te,
    active: f.active,
    sort_order: Number(f.sort_order) || 0,
  }
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''

const SOURCE_LABEL: Record<string, string> = {
  payment: 'Paid', free_plan: 'Free plan', manual: 'By moderator', free_forever: 'Free forever',
}

export default function ModeratorSubscriptionsPage() {
  const { zone, checked } = useModeratorAuth()
  const [tab, setTab] = useState<'plans' | 'aggregators'>('plans')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [aggs, setAggs] = useState<Aggregator[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [listingCounts, setListingCounts] = useState<{ visible: Record<string, number>; hidden: Record<string, number> }>({ visible: {}, hidden: {} })
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [grantFor, setGrantFor] = useState<Aggregator | null>(null)
  const [busy, setBusy] = useState(false)
  const [bulkFee, setBulkFee] = useState<string>('')

  useEffect(() => {
    if (!checked) return
    fetch('/api/moderator/bulk-fee', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setBulkFee(String(j?.feePercent ?? 0)))
      .catch(() => setBulkFee('0'))
  }, [checked])

  const saveBulkFee = async () => {
    setBusy(true); setError('')
    const r = await fetch('/api/moderator/bulk-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ feePercent: bulkFee }),
    }).catch(() => null)
    setBusy(false)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setError(j?.error ?? 'Could not save the bulk fee.'); return }
    setBulkFee(String(j.feePercent))
  }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [p, s] = await Promise.all([
      fetch('/api/moderator/subscription-plans', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null),
      fetch('/api/moderator/aggregator-subscriptions', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null),
    ])
    setLoading(false)
    if (!p || !s) { setError('Network error. Please try again.'); return }
    setPlans((p.plans ?? []) as PlanRow[])
    setAggs((s.aggregators ?? []) as Aggregator[])
    setSubs((s.subscriptions ?? []) as Sub[])
    setListingCounts({ visible: s.visibleListings ?? {}, hidden: s.hiddenListings ?? {} })
    setConfigured(p.configured !== false && s.configured !== false)
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const savePlan = async (f: Form) => {
    setBusy(true); setError('')
    const r = await fetch(`/api/moderator/subscription-plans/${f.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(bodyOf(f)),
    }).catch(() => null)
    setBusy(false)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setError(j?.error ?? 'Could not save.'); return false }
    await load()
    return true
  }

  const quickToggle = async (p: PlanRow, change: Partial<Form>) => {
    if (busy) return
    await savePlan({ ...formFromPlan(p), ...change })
  }

  const listingsAction = async (a: Aggregator, action: 'hide' | 'restore') => {
    const ask = action === 'hide'
      ? `Hide all of ${a.name}'s listings from buyers? Do this only after you have spoken to them. You can restore them any time.`
      : `Put ${a.name}'s hidden listings back for buyers?`
    if (busy || !confirm(ask)) return
    setBusy(true); setError('')
    const r = await fetch('/api/moderator/aggregator-subscriptions/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ aggregatorId: a.id, action }),
    }).catch(() => null)
    setBusy(false)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setError(j?.error ?? 'Could not do that.'); return }
    await load()
  }

  const switchOff = async (s: Sub) => {
    if (busy || !confirm('Switch this subscription off? There is no refund.')) return
    setBusy(true)
    const r = await fetch(`/api/moderator/aggregator-subscriptions/${s.id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null)
    setBusy(false)
    if (!r || !r.ok) { setError('Could not switch it off.'); return }
    await load()
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Subscriptions" subtitle="Aggregator plans, offers and who holds what — all zones" zone={zone}>
      {!configured && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm font-semibold mb-4">
          Plans are not set up in this database yet. Run scripts/subscription-migration.sql, then scripts/two-plans-migration.sql.
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>}

      <div className="grid grid-cols-2 gap-2 mb-4" role="tablist">
        {(['plans', 'aggregators'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-[44px] rounded-xl border-2 text-sm font-bold ${tab === k ? 'border-green-700 bg-green-50 text-green-900' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            {k === 'plans' ? `Plans (${plans.length})` : `Aggregators (${aggs.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : tab === 'plans' ? (
        <>
          {/* Platform fee on bulk orders (Phase 6) — 0% for now; on the produce only. */}
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <label className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-gray-600 mb-1">Platform fee on bulk orders (%)</span>
              <input
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                inputMode="decimal"
                value={bulkFee}
                onChange={(e) => setBulkFee(e.target.value.replace(/[^\d.]/g, ''))}
              />
              <span className="mt-1 block text-[11px] text-gray-500">Charged to the aggregator on the produce price only — never on transport. 0 = no fee.</span>
            </label>
            <button disabled={busy} onClick={() => void saveBulkFee()} className="min-h-[44px] rounded-xl bg-green-800 px-4 text-sm font-bold text-white disabled:opacity-50">Save</button>
          </div>

          <div className="mb-3">
            <p className="text-sm font-bold text-gray-800">Two plans: Buying and Selling</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Set each plan’s price and duration, then show it to aggregators. An aggregator who wants both buys both.
              {' '}{plans.filter((p) => p.active !== false).length} of {plans.length} shown now.
            </p>
          </div>
          {plans.length === 0 ? (
            <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
              <div className="text-5xl mb-3">🏷️</div>
              <p className="font-semibold text-gray-500 text-sm">Plans are not set up yet</p>
              <p className="text-xs text-gray-400 mt-1">Run scripts/two-plans-migration.sql. Until then the homepage says “Plans coming soon”.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {plans.map((p) => (
                <div key={p.id} className={p.active === false ? 'opacity-60' : ''}>
                  <PlanCard
                    plan={p}
                    lang="en"
                    footer={
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setForm(formFromPlan(p))} className="flex-1 min-h-[40px] rounded-xl bg-gray-900 text-white text-xs font-bold">Edit price &amp; duration</button>
                        <button disabled={busy} onClick={() => void quickToggle(p, { active: p.active === false })} className="flex-1 min-h-[40px] rounded-xl border border-gray-300 text-xs font-bold text-gray-700">
                          {p.active === false ? 'Show to aggregators' : 'Hide'}
                        </button>
                        {p.offer_price != null && (
                          <button disabled={busy} onClick={() => void quickToggle(p, { offer_enabled: !p.offer_enabled })} className="w-full min-h-[40px] rounded-xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900">
                            {p.offer_enabled ? 'Switch offer off' : 'Switch offer on'}
                          </button>
                        )}
                      </div>
                    }
                  />
                  {p.active === false && <p className="text-[11px] font-bold text-gray-500 mt-1 text-center">Hidden — aggregators cannot see or buy it</p>}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <AggregatorList aggs={aggs} subs={subs} counts={listingCounts} busy={busy} onGrant={setGrantFor} onSwitchOff={switchOff} onListings={listingsAction} />
      )}

      {form && (
        <PlanForm
          initial={form}
          busy={busy}
          onCancel={() => setForm(null)}
          onSave={async (f) => { if (await savePlan(f)) setForm(null) }}
        />
      )}
      {grantFor && (
        <GrantSheet
          agg={grantFor}
          onCancel={() => setGrantFor(null)}
          onDone={async () => { setGrantFor(null); await load() }}
        />
      )}
    </ModeratorShell>
  )
}

function AggregatorList({ aggs, subs, counts, busy, onGrant, onSwitchOff, onListings }: {
  aggs: Aggregator[]
  subs: Sub[]
  counts: { visible: Record<string, number>; hidden: Record<string, number> }
  busy: boolean
  onGrant: (a: Aggregator) => void
  onSwitchOff: (s: Sub) => void
  onListings: (a: Aggregator, action: 'hide' | 'restore') => void
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'ending' | 'expired'>('all')
  const mineOf = (a: Aggregator) => subs.filter((s) => s.aggregator_id === a.id)
  const matches = (a: Aggregator) => {
    if (filter === 'ending') return standingOf(mineOf(a)).state === 'ending'
    if (filter === 'expired') return hideDue(mineOf(a)).due
    return true
  }
  const shown = aggs.filter((a) => matches(a) && (!q.trim() || `${a.name} ${a.village ?? ''} ${a.phone ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const n = { ending: aggs.filter((a) => standingOf(mineOf(a)).state === 'ending').length, expired: aggs.filter((a) => hideDue(mineOf(a)).due).length }
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter">
        {([['all', `All (${aggs.length})`], ['ending', `Ending in 3 days (${n.ending})`], ['expired', `Expired ${HIDE_AFTER_DAYS}+ days (${n.expired})`]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`shrink-0 min-h-[40px] rounded-full border px-3 text-xs font-bold ${filter === k ? 'border-green-800 bg-green-800 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, village or phone"
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
      />
      {shown.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No aggregators found.</p>}
      {shown.map((a) => {
        const mine = mineOf(a)
        const access = accessOf(mine)
        const due = hideDue(mine)
        const visible = counts.visible[a.id] ?? 0
        const hidden = counts.hidden[a.id] ?? 0
        return (
          <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm">{a.name}</p>
                <p className="text-xs text-gray-500">{[a.village, a.phone && `+91 ${a.phone}`].filter(Boolean).join(' · ')}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Pill on={access.buying} label="Buying" />
                  <Pill on={access.selling} label="Selling" />
                  {access.forever ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Forever</span>
                  ) : access.endsAt ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Till {fmt(access.endsAt)}</span>
                  ) : null}
                  {due.endedAt && !access.selling && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${due.due ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      Ended {due.daysSince} day{due.daysSince === 1 ? '' : 's'} ago
                    </span>
                  )}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
                    {visible} listing{visible === 1 ? '' : 's'} live{hidden ? ` · ${hidden} hidden` : ''}
                  </span>
                </div>
              </div>
              <button onClick={() => onGrant(a)} className="shrink-0 bg-green-800 text-white text-xs font-bold px-3 py-2 rounded-xl">Activate…</button>
            </div>
            {access.current.length > 0 && (
              <ul className="mt-3 border-t border-gray-100 pt-2 space-y-1.5">
                {access.current.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 text-gray-700">
                      <span className="font-semibold">{PLAN_KIND_LABELS[s.kind as PlanKind]?.en ?? s.kind}</span>
                      {' · '}{SOURCE_LABEL[s.source] ?? s.source}
                      {' · '}{s.ends_at ? `till ${fmt(s.ends_at)}` : 'no end'}
                      {Number(s.amount_paid) > 0 ? ` · paid ${inr(Number(s.amount_paid))}` : ''}
                      {(s as Sub).receipt_no ? <span className="text-gray-400"> · {(s as Sub).receipt_no}</span> : null}
                      {(s as Sub).note ? <span className="text-gray-400"> · {(s as Sub).note}</span> : null}
                    </span>
                    <button disabled={busy} onClick={() => onSwitchOff(s as Sub)} className="shrink-0 text-red-700 font-bold underline">Switch off</button>
                  </li>
                ))}
              </ul>
            )}
            {(due.due && visible > 0) || hidden > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {due.due && visible > 0 && (
                  <button disabled={busy} onClick={() => onListings(a, 'hide')} className="min-h-[40px] rounded-xl bg-red-700 px-3 text-xs font-bold text-white disabled:opacity-50">
                    Hide {visible} listing{visible === 1 ? '' : 's'}
                  </button>
                )}
                {hidden > 0 && (
                  <button disabled={busy} onClick={() => onListings(a, 'restore')} className="min-h-[40px] rounded-xl border border-gray-300 px-3 text-xs font-bold text-gray-800 disabled:opacity-50">
                    Restore {hidden} hidden listing{hidden === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400 line-through'}`}>
      {on ? '✓' : '✕'} {label}
    </span>
  )
}

function PlanForm({ initial, busy, onCancel, onSave }: {
  initial: Form
  busy: boolean
  onCancel: () => void
  onSave: (f: Form) => void
}) {
  const [f, setF] = useState<Form>(initial)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const check = useMemo(() => validatePlan(bodyOf(f)), [f])
  // Live preview: what the homepage card will show with these values.
  const preview: PlanRow = check.ok
    ? { id: 'preview', ...check.columns }
    : { id: 'preview', ...bodyOf(f), duration_days: Number(bodyOf(f).duration_days) || 30, actual_price: Number(f.actual_price) || 0 }
  const input = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm'
  const label = 'block text-xs font-bold text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-3xl p-5 max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">Edit {PLAN_KIND_LABELS[f.kind].en} plan</h2>
          <button onClick={onCancel} className="text-2xl leading-none text-gray-400" aria-label="Close">×</button>
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
              {f.kind === 'buying' ? 'Unlocks buying in bulk from the bulk market.' : 'Unlocks selling produce on Go Grameen — retail, wholesale or both.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label><span className={label}>Name (English)</span><input className={input} value={f.name_en} onChange={(e) => set('name_en', e.target.value)} placeholder={f.kind === 'buying' ? 'Buying plan' : 'Selling plan'} /></label>
              <label><span className={label}>Name (Telugu)</span><input className={input} value={f.name_te} onChange={(e) => set('name_te', e.target.value)} placeholder={f.kind === 'buying' ? 'కొనుగోలు ప్లాన్' : 'అమ్మకం ప్లాన్'} /></label>
            </div>
            <div>
              <span className={label}>Duration</span>
              <div className="grid grid-cols-3 gap-2">
                {([['30', 'Monthly'], ['365', 'Yearly'], ['custom', 'Custom']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set('duration', v)} className={`min-h-[44px] rounded-xl border-2 text-xs font-bold ${f.duration === v ? 'border-green-700 bg-green-50 text-green-900' : 'border-gray-200 text-gray-600'}`}>{l}</button>
                ))}
              </div>
              {f.duration === 'custom' && (
                <input className={`${input} mt-2`} inputMode="numeric" value={f.customDays} onChange={(e) => set('customDays', e.target.value.replace(/\D/g, ''))} placeholder="Number of days, e.g. 90" />
              )}
            </div>
            <label className="block"><span className={label}>Actual price (₹) — 0 for a free plan</span>
              <input className={input} inputMode="decimal" value={f.actual_price} onChange={(e) => set('actual_price', e.target.value)} placeholder="999" />
            </label>

            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <input type="checkbox" checked={f.offer_enabled} onChange={(e) => set('offer_enabled', e.target.checked)} className="h-5 w-5" />
                Offer price is ON
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className={label}>Offer price (₹)</span><input className={input} inputMode="decimal" value={f.offer_price} onChange={(e) => set('offer_price', e.target.value)} placeholder="599" /></label>
                <label><span className={label}>Offer ends (optional)</span><input type="date" className={input} value={f.offer_end_date} onChange={(e) => set('offer_end_date', e.target.value)} /></label>
                <label><span className={label}>Offer tag (English)</span><input className={input} value={f.offer_label_en} onChange={(e) => set('offer_label_en', e.target.value)} placeholder="Diwali offer" /></label>
                <label><span className={label}>Offer tag (Telugu)</span><input className={input} value={f.offer_label_te} onChange={(e) => set('offer_label_te', e.target.value)} placeholder="దీపావళి ఆఫర్" /></label>
              </div>
              <p className="text-[11px] text-amber-900">After the end date the actual price shows again by itself. Switching the offer off keeps its price for next time.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label><span className={label}>Benefits (English) — one per line</span><textarea rows={4} className={input} value={f.highlights_en} onChange={(e) => set('highlights_en', e.target.value)} placeholder={'See every bulk listing\nFarmer phone numbers\nBuy direct, pay online'} /></label>
              <label><span className={label}>Benefits (Telugu) — one per line</span><textarea rows={4} className={input} value={f.highlights_te} onChange={(e) => set('highlights_te', e.target.value)} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 min-h-[44px]">
              <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="h-5 w-5" />
              Show to aggregators
            </label>
          </div>

          <div>
            <p className={label}>Homepage preview</p>
            <PlanCard plan={preview} lang="en" />
            {!check.ok && <p className="mt-2 text-xs font-bold text-red-700">{check.error}</p>}
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 min-h-[48px] rounded-xl border border-gray-300 font-bold text-gray-700">Cancel</button>
          <button disabled={busy || !check.ok} onClick={() => onSave(f)} className="flex-1 min-h-[48px] rounded-xl bg-green-800 text-white font-bold disabled:opacity-50">
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GrantSheet({ agg, onCancel, onDone }: { agg: Aggregator; onCancel: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<PlanKind>('combined')
  const [mode, setMode] = useState<'days' | 'forever'>('days')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true); setError('')
    const r = await fetch('/api/moderator/aggregator-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ aggregatorId: agg.id, kind, forever: mode === 'forever', days: mode === 'days' ? Number(days) : undefined, note }),
    }).catch(() => null)
    setBusy(false)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setError(j?.error ?? 'Could not activate.'); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-extrabold">Activate for {agg.name}</h2>
          <p className="text-xs text-gray-500">No payment is taken. It starts now.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PLAN_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`min-h-[44px] rounded-xl border-2 px-1 text-xs font-bold ${kind === k ? 'border-green-700 bg-green-50 text-green-900' : 'border-gray-200 text-gray-600'}`}>
              {PLAN_KIND_LABELS[k].en}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('days')} className={`min-h-[44px] rounded-xl border-2 text-xs font-bold ${mode === 'days' ? 'border-green-700 bg-green-50 text-green-900' : 'border-gray-200 text-gray-600'}`}>For some days</button>
          <button type="button" onClick={() => setMode('forever')} className={`min-h-[44px] rounded-xl border-2 text-xs font-bold ${mode === 'forever' ? 'border-purple-700 bg-purple-50 text-purple-900' : 'border-gray-200 text-gray-600'}`}>Free forever</button>
        </div>
        {mode === 'days' && (
          <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} placeholder="Days, e.g. 30" />
        )}
        <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. client account, trial" />
        {error && <p className="text-xs font-bold text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 min-h-[48px] rounded-xl border border-gray-300 font-bold text-gray-700">Cancel</button>
          <button disabled={busy} onClick={() => void submit()} className="flex-1 min-h-[48px] rounded-xl bg-green-800 text-white font-bold disabled:opacity-50">
            {busy ? 'Saving…' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  )
}
