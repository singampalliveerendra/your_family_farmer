import type { FarmerOrder } from '@/components/farmer/OrderCard'
import { isResolved } from '@/components/farmer/OrderCard'
import { isOrderPaid, isPaymentClaimed } from '@/lib/payment'

// One-month window for the report: orders created in the last 30 days. Kept in
// sync with the "month" time filter on the orders page.
export const REPORT_WINDOW_DAYS = 30

export function ordersInReportWindow(orders: FarmerOrder[]): FarmerOrder[] {
  const start = Date.now() - REPORT_WINDOW_DAYS * 86400000
  return orders
    .filter((o) => new Date(o.created_at).getTime() >= start)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export type ReportStatus = 'Pending' | 'Approved' | 'Completed' | 'Declined' | 'Cancelled'

// Human label for the farmer-facing status of an order, matching the chips on
// the orders page (pending / approved / picked up / declined / cancelled).
export function statusLabel(o: FarmerOrder): ReportStatus {
  if (o.status === 'pending') return 'Pending'
  if (o.status === 'declined') return 'Declined'
  if (o.status === 'cancelled') return 'Cancelled'
  return isResolved(o) ? 'Completed' : 'Approved'
}

export function deliveryLabel(o: FarmerOrder): string {
  if (o.delivery_type === 'home_delivery') return 'Home delivery'
  if (o.delivery_type === 'courier') return 'Courier'
  return 'Self pickup'
}

export function paymentLabel(o: FarmerOrder): string {
  const method = o.payment_method ? o.payment_method.toUpperCase() : '—'
  const status = o.payment_status || 'pending'
  return `${method} · ${status}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export const REPORT_STATUSES: ReportStatus[] = ['Pending', 'Approved', 'Completed', 'Declined', 'Cancelled']

// The report can be sliced by a created-at date range and by status. An empty
// `statuses` array means "all statuses".
export type ReportFilter = {
  from: Date
  to: Date
  statuses: ReportStatus[]
}

// Filter orders by created-at range and (optionally) status, newest first.
export function filterOrders(orders: FarmerOrder[], filter: ReportFilter): FarmerOrder[] {
  const fromMs = filter.from.getTime()
  const toMs = filter.to.getTime()
  const allStatuses = filter.statuses.length === 0
  return orders
    .filter((o) => {
      const t = new Date(o.created_at).getTime()
      if (t < fromMs || t > toMs) return false
      if (!allStatuses && !filter.statuses.includes(statusLabel(o))) return false
      return true
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export type ReportData = {
  orders: FarmerOrder[]
  counts: Record<ReportStatus, number>
  revenue: number
  // Service fee (moderator commission) the farmer is charged on the orders he
  // DECLINED in this window: round(produce price × fee%) per declined order. It
  // recovers the gateway/refund cost the platform ate by refunding the buyer in
  // full, and is deducted from the farmer's payout. Mirrors the moderator
  // reports payout deduction so the two figures agree. 0 if no fee is set.
  serviceFeeDeducted: number
  fromDate: Date
  toDate: Date
  generatedAt: Date
}

// Per-declined-order service fee, rounded per order to match the moderator's
// payout deduction (see app/api/moderator/reports/route.ts). This is the
// penalty the farmer bears on a decline, shown as a negative amount for that
// order in the report.
export function declineServiceFee(o: FarmerOrder, feePercent: number): number {
  if (o.status !== 'declined' || feePercent <= 0) return 0
  return Math.round(((Number(o.total_price) || 0) * feePercent) / 100)
}

// ── Payment / refund / received figures for the report ──────────────────────

// True once the buyer's money is actually in (paid gateway or claimed manual).
export function isPaidOrder(o: FarmerOrder): boolean {
  return isOrderPaid(o.payment_status) || isPaymentClaimed(o.payment_status)
}

// Amount the buyer paid for this order row = produce price + this row's share of
// the delivery and platform fees (both stamped on the cart's first row only).
// 0 when the buyer hasn't paid yet.
export function amountPaid(o: FarmerOrder): number {
  if (!isPaidOrder(o)) return 0
  return (Number(o.total_price) || 0) + (Number(o.delivery_fee) || 0) + (Number(o.platform_fee) || 0)
}

// Refund raised on this order (buyer cancel / farmer decline). 0 if none.
export function refundAmount(o: FarmerOrder): number {
  return Math.max(0, Number(o.refund_amount) || 0)
}

// Net amount the farmer actually receives for this order:
//   • completed / approved → the produce price (total_price)
//   • declined            → negative platform-fee penalty
//   • cancelled           → 0 (buyer's produce money is refunded)
export function amountReceived(o: FarmerOrder, feePercent: number): number {
  if (o.status === 'declined') return -declineServiceFee(o, feePercent)
  if (o.status === 'cancelled') return 0
  return Number(o.total_price) || 0
}

// Shared computation for both the on-screen report view and the printable PDF:
// the chosen date/status window, per-status counts, approved revenue, and the
// service fee deducted on declined orders. `feePercent` is the moderator
// commission percentage (5 → 5%); pass 0 when none is set.
export function computeReportData(orders: FarmerOrder[], filter: ReportFilter, feePercent = 0): ReportData {
  const windowOrders = filterOrders(orders, filter)
  const counts: Record<ReportStatus, number> = {
    Pending: 0, Approved: 0, Completed: 0, Declined: 0, Cancelled: 0,
  }
  let revenue = 0
  let serviceFeeDeducted = 0
  for (const o of windowOrders) {
    counts[statusLabel(o)] += 1
    if (o.status === 'approved') revenue += o.total_price ?? 0
    serviceFeeDeducted += declineServiceFee(o, feePercent)
  }
  return {
    orders: windowOrders,
    counts,
    revenue,
    serviceFeeDeducted,
    fromDate: filter.from,
    toDate: filter.to,
    generatedAt: new Date(),
  }
}

// Escape any farmer/buyer-supplied text before injecting it into the report HTML.
function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReportHtml(orders: FarmerOrder[], farmerName: string, filter: ReportFilter, feePercent = 0): string {
  const { orders: window, counts, revenue, serviceFeeDeducted, fromDate, toDate, generatedAt } = computeReportData(orders, filter, feePercent)
  const rangeDesc = `${fmtDate(fromDate.toISOString())} – ${fmtDate(toDate.toISOString())}`
  const statusDesc = filter.statuses.length === 0 ? 'All statuses' : filter.statuses.join(', ')

  const rows = window.map((o) => {
    // Declined orders show the farmer's penalty as a negative amount (the
    // platform fee lost on the decline), not the produce price they never earn.
    const penalty = declineServiceFee(o, feePercent)
    const amountCell =
      o.status === 'declined'
        ? (penalty > 0 ? `<span class="neg">−₹${esc(penalty)}</span>` : '—')
        : (o.total_price != null ? `₹${esc(o.total_price)}` : '—')

    // Payment / refund / received detail.
    const paid = amountPaid(o)
    const paidCell = paid > 0 ? `₹${esc(paid)}` : '—'
    const refund = refundAmount(o)
    const refundCell = refund > 0 || o.refund_status
      ? `${refund > 0 ? `₹${esc(refund)}` : '—'}${o.refund_status ? `<br><span class="muted">${esc(o.refund_status)}</span>` : ''}`
      : '—'
    const received = amountReceived(o, feePercent)
    const receivedCell = received < 0
      ? `<span class="neg">−₹${esc(Math.abs(received))}</span>`
      : `₹${esc(received)}`
    return `
    <tr>
      <td class="mono">${esc(o.order_code || '—')}</td>
      <td>${esc(fmtDate(o.created_at))}</td>
      <td>${esc(o.buyer_name || '—')}${o.buyer_phone ? `<br><span class="muted">+91 ${esc(o.buyer_phone)}</span>` : ''}</td>
      <td>${esc(o.produce_name || '—')}</td>
      <td class="num">${esc(o.quantity ?? '—')} ${esc(o.unit || 'kg')}</td>
      <td class="num">${amountCell}</td>
      <td><span class="status status-${statusLabel(o).toLowerCase()}">${esc(statusLabel(o))}</span></td>
      <td>${esc(paymentLabel(o))}</td>
      <td class="num">${paidCell}</td>
      <td class="num">${refundCell}</td>
      <td class="num">${receivedCell}</td>
      <td>${esc(deliveryLabel(o))}</td>
      <td>${esc(fmtDateTime(o.fulfillment_date))}</td>
    </tr>`
  }).join('')

  const summaryChips = REPORT_STATUSES
    .map((k) => `<div class="chip"><span class="chip-n">${counts[k]}</span><span class="chip-l">${k}</span></div>`)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orders report — ${esc(farmerName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #14532d; }
  .sub { color: #555; font-size: 13px; margin: 0 0 16px; }
  .summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 18px; }
  .chip { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 14px; min-width: 84px; }
  .chip-n { display: block; font-size: 20px; font-weight: 800; color: #14532d; }
  .chip-l { display: block; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .03em; }
  .revenue { background: #f0fdf4; border-color: #bbf7d0; }
  .deduction { background: #fef2f2; border-color: #fecaca; }
  .deduction .chip-n { color: #991b1b; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { background: #14532d; color: #fff; text-align: left; padding: 8px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; }
  tbody td { padding: 8px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .num { white-space: nowrap; }
  .neg { color: #991b1b; font-weight: 700; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }
  .muted { color: #888; font-size: 11px; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .status-pending { background: #fef9c3; color: #854d0e; }
  .status-approved { background: #dbeafe; color: #1e40af; }
  .status-completed { background: #dcfce7; color: #166534; }
  .status-declined { background: #fee2e2; color: #991b1b; }
  .status-cancelled { background: #f3f4f6; color: #374151; }
  .empty { text-align: center; padding: 40px; color: #888; }
  footer { margin-top: 18px; font-size: 11px; color: #999; }
  @media print { body { padding: 0; } @page { margin: 14mm; } }
</style>
</head>
<body>
  <h1>Orders Report</h1>
  <p class="sub">
    ${esc(farmerName)} &nbsp;•&nbsp; ${esc(rangeDesc)}
    &nbsp;•&nbsp; ${esc(statusDesc)} &nbsp;•&nbsp; Generated ${esc(fmtDateTime(generatedAt.toISOString()))}
  </p>

  <div class="summary">
    <div class="chip"><span class="chip-n">${window.length}</span><span class="chip-l">Total orders</span></div>
    ${summaryChips}
    <div class="chip revenue"><span class="chip-n">₹${revenue}</span><span class="chip-l">Approved revenue</span></div>
    ${serviceFeeDeducted > 0
      ? `<div class="chip deduction"><span class="chip-n">−₹${serviceFeeDeducted}</span><span class="chip-l">Service fee on declined</span></div>`
      : ''}
  </div>

  ${window.length === 0
    ? '<p class="empty">No orders match these filters.</p>'
    : `<table>
    <thead>
      <tr>
        <th>Order</th><th>Date</th><th>Buyer</th><th>Harvest</th><th>Qty</th>
        <th>Amount</th><th>Status</th><th>Payment</th><th>Paid</th><th>Refund</th><th>Received</th><th>Delivery</th><th>Fulfil date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}

  <footer>YourFamilyFarmer — ${esc(rangeDesc)}${filter.statuses.length ? ` · ${esc(statusDesc)}` : ''}.</footer>
</body>
</html>`
}

// Open the printable report in a new window/tab and trigger the browser's print
// dialog, where the farmer chooses "Save as PDF". Dependency-free on purpose —
// no client-side PDF library to download over a slow 4G connection.
// Returns false if the window was blocked (caller can surface a message).
export function downloadOrdersReport(orders: FarmerOrder[], farmerName: string, filter: ReportFilter, feePercent = 0): boolean {
  const html = buildReportHtml(orders, farmerName, filter, feePercent)
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  // Print once, whichever fires first: onload (clean path) or the timeout
  // fallback for browsers that don't re-fire load on a written about:blank.
  let printed = false
  const printOnce = () => {
    if (printed) return
    printed = true
    try { win.focus(); win.print() } catch { /* window may be closed */ }
  }
  win.onload = printOnce
  setTimeout(printOnce, 600)
  return true
}
