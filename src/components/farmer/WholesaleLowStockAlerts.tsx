'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { farmerFetch, isFarmerSessionExpired } from '@/lib/farmer-auth-client'
import { formatQty } from '@/lib/saleStep'
import {
  dismiss,
  isDismissed,
  pruneDismissals,
  readDismissals,
  writeDismissals,
  type LowStockDismissals,
} from '@/lib/lowStockDismissals'
import { offersWholesale, parseSaleMode } from '@/lib/wholesale'
import {
  LOW_STOCK_CHOICES,
  isWholesaleLowStock,
  lowStockChoicePayload,
  suggestedMinimum,
  wholesaleStock,
  type LowStockChoice,
  type StockHarvest,
} from '@/lib/wholesaleVisibility'

// The farmer's in-app alert: one card per produce whose wholesale side is
// hidden because its stock fell below the minimum, with the three ways out —
// lower the minimum, move it to retail, or add more stock. Shown for as long as
// the stock stays low (it is computed, so it clears itself when stock comes
// back). The WhatsApp message is only the nudge; this is where it gets fixed.
// The farmer can also dismiss a card to keep the produce as it is (see
// src/lib/lowStockDismissals.ts for when it comes back).

type Row = {
  id: string
  name: string
  unit: string | null
  stock_qty: number | null
  sale_mode?: string | null
  wholesale_price?: number | null
  wholesale_min_qty?: number | null
  wholesale_pack_size?: number | null
  wholesale_transport_states?: string[] | null
  price_tier_1_price?: number | null
}

type LowItem = { row: Row; harvests: StockHarvest[] }

export default function WholesaleLowStockAlerts({
  farmerId,
  refreshKey,
  onAddStock,
  onChanged,
}: {
  farmerId: string
  /** Bump to reload (e.g. after the dashboard saved a produce). */
  refreshKey?: number
  /** Open this produce so the farmer can log a harvest or raise its stock. */
  onAddStock: (listingId: string) => void
  onChanged?: () => void
}) {
  const { L } = useLang()
  const [items, setItems] = useState<LowItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  // Wholesale-only produce moving to retail needs a retail price first.
  const [askPrice, setAskPrice] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [dismissed, setDismissed] = useState<LowStockDismissals>({})

  const load = useCallback(async () => {
    // select('*'): before the wholesale migration there are no such columns,
    // every row reads as retail and nothing is shown.
    const { data } = await supabase.from('produce_listings').select('*').eq('farmer_id', farmerId)
    const ws = ((data ?? []) as Row[]).filter((r) => offersWholesale(parseSaleMode(r.sale_mode)))
    if (ws.length === 0) { setItems([]); return }
    const { data: hv } = await supabase
      .from('harvests')
      .select('id, produce_listing_id, stock_qty')
      .in('produce_listing_id', ws.map((r) => r.id))
      .eq('paused', false)
    const byListing = new Map<string, StockHarvest[]>()
    for (const h of (hv ?? []) as Array<StockHarvest & { produce_listing_id: string }>) {
      byListing.set(h.produce_listing_id, [...(byListing.get(h.produce_listing_id) ?? []), { id: h.id, stock_qty: h.stock_qty }])
    }
    const low = ws.map((row) => ({ row, harvests: byListing.get(row.id) ?? [] })).filter((i) => isWholesaleLowStock(i.row, i.harvests))
    // Forget dismissals for produce whose stock recovered, so a new drop alerts again.
    const saved = readDismissals(typeof window === 'undefined' ? null : window.localStorage, farmerId)
    const pruned = pruneDismissals(saved, low.map((i) => i.row.id))
    if (pruned !== saved) writeDismissals(window.localStorage, farmerId, pruned)
    setDismissed(pruned)
    setItems(low)
  }, [farmerId])

  const dismissItem = (item: LowItem) => {
    const next = dismiss(dismissed, item.row.id, Number(item.row.wholesale_min_qty))
    writeDismissals(window.localStorage, farmerId, next)
    setDismissed(next)
    if (askPrice === item.row.id) setAskPrice(null)
    if (error?.id === item.row.id) setError(null)
  }

  useEffect(() => { void load() }, [load, refreshKey])

  const choose = async (item: LowItem, choice: LowStockChoice) => {
    setError(null)
    if (choice === 'add_stock') { onAddStock(item.row.id); return }
    const isWholesaleOnly = parseSaleMode(item.row.sale_mode) === 'wholesale'
    if (choice === 'move_to_retail' && isWholesaleOnly && item.row.price_tier_1_price == null && askPrice !== item.row.id) {
      setAskPrice(item.row.id)
      setPrice(item.row.wholesale_price != null ? String(item.row.wholesale_price) : '')
      return
    }
    const r = lowStockChoicePayload(choice, item.row, item.harvests, askPrice === item.row.id ? price : null)
    if (!r.ok) { setError({ id: item.row.id, text: L(r.error.en, r.error.te) }); return }
    setBusy(item.row.id)
    try {
      const res = await farmerFetch('/api/farmer/update-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: item.row.id, payload: r.payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ id: item.row.id, text: (json as { error?: string }).error ?? L('Could not save. Please try again.', 'సేవ్ చేయలేకపోయాం. మళ్ళీ ప్రయత్నించండి.') })
        return
      }
      setAskPrice(null)
      await load()
      onChanged?.()
    } catch (e) {
      if (isFarmerSessionExpired(e)) return
      setError({ id: item.row.id, text: L('Network error — please try again.', 'నెట్‌వర్క్ లోపం — మళ్ళీ ప్రయత్నించండి.') })
    } finally {
      setBusy(null)
    }
  }

  const visible = items.filter((i) => !isDismissed(dismissed, i.row.id, Number(i.row.wholesale_min_qty)))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      {visible.map((item) => {
        const { row } = item
        const unit = row.unit || 'kg'
        const left = wholesaleStock(row, item.harvests) ?? 0
        const lower = suggestedMinimum(row, item.harvests)
        const working = busy === row.id
        return (
          <div key={row.id} className="relative bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 space-y-2.5" role="alert">
            <button
              type="button"
              onClick={() => dismissItem(item)}
              aria-label={L(`Dismiss alert for ${row.name}`, `${row.name} హెచ్చరికను మూసివేయండి`)}
              className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-amber-800 active:bg-amber-100"
            >
              <span aria-hidden>✕</span>
            </button>
            <div className="flex items-start gap-2.5 pr-8">
              <span className="text-2xl leading-none" aria-hidden>🚚</span>
              <div className="min-w-0">
                <p className="font-extrabold text-amber-900 text-sm leading-tight">
                  {L(`Wholesale hidden: ${row.name}`, `హోల్‌సేల్ దాచబడింది: ${row.name}`)}
                </p>
                <p className="text-[12px] text-amber-800 mt-0.5 leading-snug">
                  {L(
                    `Only ${formatQty(left)} ${unit} left — your minimum is ${formatQty(Number(row.wholesale_min_qty))} ${unit}. Wholesale buyers can't see it until you choose:`,
                    `${formatQty(left)} ${unit} మాత్రమే మిగిలింది — మీ కనీస పరిమాణం ${formatQty(Number(row.wholesale_min_qty))} ${unit}. మీరు ఎంచుకునే వరకు హోల్‌సేల్ కొనుగోలుదారులకు ఇది కనిపించదు:`,
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={working || lower === null}
                onClick={() => choose(item, 'lower_minimum')}
                className="w-full min-h-[44px] rounded-xl border-2 border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 text-left disabled:opacity-50"
              >
                ⬇️ {L(LOW_STOCK_CHOICES.lower_minimum.en, LOW_STOCK_CHOICES.lower_minimum.te)}
                {lower !== null && <span className="font-semibold text-amber-700"> — {formatQty(lower)} {unit}</span>}
                {lower === null && <span className="block text-[11px] font-semibold text-gray-500">{L('Not even one pack left', 'ఒక్క ప్యాక్ కూడా మిగల్లేదు')}</span>}
              </button>

              <button
                type="button"
                disabled={working}
                onClick={() => choose(item, 'move_to_retail')}
                className="w-full min-h-[44px] rounded-xl border-2 border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 text-left disabled:opacity-50"
              >
                🛒 {L(LOW_STOCK_CHOICES.move_to_retail.en, LOW_STOCK_CHOICES.move_to_retail.te)}
              </button>

              {askPrice === row.id && (
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={L(`Retail price per ${unit}`, `ఒక ${unit} చిల్లర ధర`)}
                      placeholder={L(`Retail price per ${unit}`, `ఒక ${unit} చిల్లర ధర`)}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-sm bg-white focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => choose(item, 'move_to_retail')}
                    className="min-h-[44px] rounded-xl bg-green-700 text-white px-4 text-sm font-bold disabled:opacity-50"
                  >
                    {L('Save', 'సేవ్')}
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={working}
                onClick={() => choose(item, 'add_stock')}
                className="w-full min-h-[44px] rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white text-left disabled:opacity-50"
              >
                ➕ {L(LOW_STOCK_CHOICES.add_stock.en, LOW_STOCK_CHOICES.add_stock.te)}
              </button>

              <button
                type="button"
                disabled={working}
                onClick={() => dismissItem(item)}
                className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm font-semibold text-amber-800 underline underline-offset-2 disabled:opacity-50"
              >
                {L('Keep it as it is — hide this alert', 'ఇలాగే ఉంచండి — ఈ హెచ్చరికను దాచండి')}
              </button>
            </div>

            {error?.id === row.id && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">{error.text}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
