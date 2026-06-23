'use client'

import { useLang } from '@/lib/LanguageContext'
import type { FarmerOrder } from '@/components/farmer/OrderCard'
import {
  computeReportData,
  downloadOrdersReport,
  statusLabel,
  deliveryLabel,
  paymentLabel,
  fmtDate,
  fmtDateTime,
  REPORT_STATUSES,
  REPORT_WINDOW_DAYS,
  type ReportStatus,
} from '@/lib/orderReport'

const STATUS_CLASS: Record<ReportStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-blue-100 text-blue-800',
  Completed: 'bg-green-100 text-green-800',
  Declined: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-200 text-gray-700',
}

// Full-screen, read-only orders report for the last 30 days. The farmer reviews
// it on screen first, then taps "Download PDF" to save it.
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
  const { orders: rows, counts, revenue, fromDate, generatedAt } = computeReportData(orders)

  const handleDownload = () => {
    const ok = downloadOrdersReport(orders, farmerName || L('Farmer', 'రైతు'))
    if (!ok) {
      alert(L(
        'Please allow pop-ups for this site to download the report.',
        'రిపోర్ట్ డౌన్‌లోడ్ చేయడానికి ఈ సైట్‌కు పాప్-అప్‌లను అనుమతించండి.',
      ))
    }
  }

  const dateRange = `${fromDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${generatedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-5 pb-4 flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-white text-lg font-extrabold leading-tight">
            {L('Orders Report', 'ఆర్డర్ల రిపోర్ట్')}
          </h2>
          <p className="text-green-300 text-xs mt-0.5 truncate">
            {farmerName || L('Farmer', 'రైతు')} · {dateRange} · {L('last 30 days', 'గత 30 రోజులు')}
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
        </div>

        {/* Order list */}
        {rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-semibold text-gray-500 text-sm">
              {L('No orders in the last 30 days', 'గత 30 రోజుల్లో ఆర్డర్లు లేవు')}
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
                  {o.total_price != null && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="font-bold text-green-700">₹{o.total_price}</span>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-500 pt-0.5">
                  <span>📅 {L('Ordered', 'ఆర్డర్')}: {fmtDate(o.created_at)}</span>
                  <span>🚚 {deliveryLabel(o)}</span>
                  <span>💳 {paymentLabel(o)}</span>
                  <span>📦 {L('Fulfil', 'పూర్తి')}: {fmtDate(o.fulfillment_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center pt-1">
          {L('Generated', 'రూపొందించబడింది')} {fmtDateTime(generatedAt.toISOString())} · {L(`last ${REPORT_WINDOW_DAYS} days only`, `గత ${REPORT_WINDOW_DAYS} రోజులు మాత్రమే`)}
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
