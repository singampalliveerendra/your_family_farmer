'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { supabase } from '@/lib/supabase'
import type { FarmerOrder } from '@/components/farmer/OrderCard'
import {
  computeReportData,
  declineServiceFee,
  amountPaid,
  refundAmount,
  amountReceived,
  downloadOrdersReport,
  statusLabel,
  deliveryLabel,
  paymentLabel,
  fmtDate,
  fmtDateTime,
  REPORT_STATUSES,
  type ReportStatus,
  type ReportFilter,
} from '@/lib/orderReport'

const STATUS_CLASS: Record<ReportStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-blue-100 text-blue-800',
  Completed: 'bg-green-100 text-green-800',
  Declined: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-200 text-gray-700',
}

type TimePreset = 'today' | 'week' | 'month' | 'all' | 'custom'

// Local YYYY-MM-DD (not UTC) so the calendar defaults line up with the
// farmer's day, not a timezone-shifted one.
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Full-screen orders report. The farmer picks a date range (preset chips or a
// custom From–To calendar) and status filters, reviews on screen, then taps
// "Download PDF" to save exactly what's shown.
export default function OrderReportSheet({
  orders,
  farmerName,
  onClose,
}: {
  orders: FarmerOrder[]
  farmerName: string
  onClose: () => void
}) {
  const { L } = useLang()

  // Moderator commission %, used to compute the service fee deducted on declined
  // orders (mirrors the moderator payout deduction). 0 unless one is set.
  const [feePercent, setFeePercent] = useState(0)
  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('fee_percent')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        const p = Number(data?.fee_percent)
        if (Number.isFinite(p) && p > 0) setFeePercent(p)
      })
  }, [])

  const today = useMemo(() => new Date(), [])
  // Earliest order date drives the "All time" lower bound (and the calendar's
  // min), so the picker never lets you wander before there's any data.
  const earliest = useMemo(() => {
    const ms = orders.reduce(
      (min, o) => Math.min(min, new Date(o.created_at).getTime()),
      today.getTime(),
    )
    return new Date(ms)
  }, [orders, today])

  const [preset, setPreset] = useState<TimePreset>('month')
  const [fromStr, setFromStr] = useState(isoDate(new Date(today.getTime() - 30 * 86400000)))
  const [toStr, setToStr] = useState(isoDate(today))
  // Empty = all statuses. Default to Completed so the report opens on finished
  // orders first; the farmer can tap "All" or other chips to widen it.
  const [statusSel, setStatusSel] = useState<ReportStatus[]>(['Completed'])

  const applyPreset = (p: Exclude<TimePreset, 'custom'>) => {
    setPreset(p)
    const to = new Date()
    let from: Date
    if (p === 'today') { from = new Date(); from.setHours(0, 0, 0, 0) }
    else if (p === 'week') from = new Date(Date.now() - 7 * 86400000)
    else if (p === 'month') from = new Date(Date.now() - 30 * 86400000)
    else from = earliest // 'all'
    setFromStr(isoDate(from))
    setToStr(isoDate(to))
  }

  const toggleStatus = (s: ReportStatus) =>
    setStatusSel((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const filter: ReportFilter = useMemo(() => ({
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59`),
    statuses: statusSel,
  }), [fromStr, toStr, statusSel])

  const { orders: rows, counts, revenue, serviceFeeDeducted, generatedAt } = useMemo(
    () => computeReportData(orders, filter, feePercent),
    [orders, filter, feePercent],
  )

  const handleDownload = () => {
    const ok = downloadOrdersReport(orders, farmerName || L('Farmer', 'రైతు'), filter, feePercent)
    if (!ok) {
      alert(L(
        'Please allow pop-ups for this site to download the report.',
        'రిపోర్ట్ డౌన్‌లోడ్ చేయడానికి ఈ సైట్‌కు పాప్-అప్‌లను అనుమతించండి.',
      ))
    }
  }

  const rangeLabel = `${fmtDate(`${fromStr}T00:00:00`)} – ${fmtDate(`${toStr}T00:00:00`)}`

  const TIME_CHIPS: { key: Exclude<TimePreset, 'custom'>; label: string }[] = [
    { key: 'today', label: L('Today', 'ఈ రోజు') },
    { key: 'week', label: L('Week', 'వారం') },
    { key: 'month', label: L('Month', 'నెల') },
    { key: 'all', label: L('All', 'అన్నీ') },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-5 pb-4 flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-white text-lg font-extrabold leading-tight">
            {L('Orders Report', 'ఆర్డర్ల రిపోర్ట్')}
          </h2>
          <p className="text-green-300 text-xs mt-0.5 truncate">
            {farmerName || L('Farmer', 'రైతు')} · {rangeLabel}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={L('Close', 'మూసివేయండి')}
          className="text-green-200 text-2xl leading-none px-2 -mt-1 active:text-white"
        >
          ✕
        </button>
      </div>

      {/* Scrollable report body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
          {/* Duration presets */}
          <div className="flex flex-wrap gap-1.5">
            {TIME_CHIPS.map((c) => (
              <button
                key={c.key}
                onClick={() => applyPreset(c.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  preset === c.key
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{L('From', 'నుండి')}</span>
              <input
                type="date"
                value={fromStr}
                min={isoDate(earliest)}
                max={toStr}
                onChange={(e) => { setFromStr(e.target.value); setPreset('custom') }}
                className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-800 focus:border-green-600 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{L('To', 'వరకు')}</span>
              <input
                type="date"
                value={toStr}
                min={fromStr}
                max={isoDate(today)}
                onChange={(e) => { setToStr(e.target.value); setPreset('custom') }}
                className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-800 focus:border-green-600 focus:outline-none"
              />
            </label>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
            <button
              onClick={() => setStatusSel([])}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                statusSel.length === 0
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              {L('All', 'అన్నీ')}
            </button>
            {REPORT_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  statusSel.includes(s) ? STATUS_CLASS[s] : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryCell n={rows.length} label={L('Total', 'మొత్తం')} highlight />
          {REPORT_STATUSES.map((s) => (
            <SummaryCell key={s} n={counts[s]} label={s} />
          ))}
          <div className="col-span-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
              {L('Approved revenue', 'ఆమోదిత ఆదాయం')}
            </span>
            <span className="text-2xl font-black text-green-800">₹{revenue}</span>
          </div>
          {serviceFeeDeducted > 0 && (
            <div className="col-span-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-xs font-bold text-red-700 uppercase tracking-wide block">
                  {L('Service fee on declined', 'తిరస్కరించిన వాటిపై సర్వీస్ ఫీజు')}
                </span>
                <span className="text-[10px] text-red-500 leading-snug">
                  {L(`Deducted from your payout (${feePercent}% of declined orders)`, `మీ చెల్లింపు నుండి తీసివేయబడుతుంది (తిరస్కరించిన ఆర్డర్లలో ${feePercent}%)`)}
                </span>
              </div>
              <span className="text-2xl font-black text-red-700 flex-shrink-0">−₹{serviceFeeDeducted}</span>
            </div>
          )}
        </div>

        {/* Order list */}
        {rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-semibold text-gray-500 text-sm">
              {L('No orders match these filters', 'ఈ ఫిల్టర్‌లకు ఆర్డర్లు లేవు')}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((o) => (
              <div key={o.id} className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-gray-900 text-sm leading-tight">
                      {o.buyer_name || '—'}
                    </p>
                    {o.buyer_phone && (
                      <p className="text-xs text-gray-500">+91 {o.buyer_phone}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[statusLabel(o)]}`}>
                      {statusLabel(o)}
                    </span>
                    {o.order_code && (
                      <span className="text-[10px] font-mono text-gray-400 mt-0.5">{o.order_code}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-semibold text-gray-800">{o.produce_name || '—'}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-600">{o.quantity ?? '—'} {o.unit || 'kg'}</span>
                  {/* Declined orders show the farmer's platform-fee penalty as a
                      negative amount; other orders show the produce price. */}
                  {o.status === 'declined' ? (
                    declineServiceFee(o, feePercent) > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="font-bold text-red-600">−₹{declineServiceFee(o, feePercent)}</span>
                      </>
                    )
                  ) : o.total_price != null ? (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="font-bold text-green-700">₹{o.total_price}</span>
                    </>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-500 pt-0.5">
                  <span>📅 {L('Ordered', 'ఆర్డర్')}: {fmtDate(o.created_at)}</span>
                  <span>🚚 {deliveryLabel(o)}</span>
                  <span>💳 {paymentLabel(o)}</span>
                  <span>📦 {L('Fulfil', 'పూర్తి')}: {fmtDateTime(o.fulfillment_date)}</span>
                  {amountPaid(o) > 0 && (
                    <span>💰 {L('Paid', 'చెల్లించింది')}: <b className="text-gray-700">₹{amountPaid(o)}</b></span>
                  )}
                  {(refundAmount(o) > 0 || o.refund_status) && (
                    <span>💸 {L('Refund', 'రీఫండ్')}: <b className="text-amber-700">₹{refundAmount(o)}</b>{o.refund_status ? ` · ${o.refund_status}` : ''}</span>
                  )}
                  <span>
                    ✅ {L('Received', 'అందింది')}:{' '}
                    {amountReceived(o, feePercent) < 0
                      ? <b className="text-red-600">−₹{Math.abs(amountReceived(o, feePercent))}</b>
                      : <b className="text-green-700">₹{amountReceived(o, feePercent)}</b>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center pt-1">
          {L('Generated', 'రూపొందించబడింది')} {fmtDateTime(generatedAt.toISOString())}
        </p>
      </div>

      {/* Sticky download bar */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3 flex gap-2">
        <button
          onClick={onClose}
          className="px-5 py-3 rounded-2xl text-sm font-bold bg-gray-100 text-gray-700 active:bg-gray-200"
        >
          {L('Close', 'మూసివేయండి')}
        </button>
        <button
          onClick={handleDownload}
          disabled={rows.length === 0}
          className="flex-1 flex items-center justify-center gap-2 bg-green-700 text-white font-bold py-3 rounded-2xl text-sm active:bg-green-800 disabled:opacity-50"
        >
          <span className="text-lg">📄</span>
          {L('Download PDF', 'PDF డౌన్‌లోడ్ చేయండి')}
        </button>
      </div>
    </div>
  )
}

function SummaryCell({ n, label, highlight }: { n: number; label: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-2 py-2 text-center ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
      <p className={`text-xl font-black ${highlight ? 'text-green-800' : 'text-gray-900'}`}>{n}</p>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}
