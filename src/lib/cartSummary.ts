// What the floating "View cart" bar shows: how many lines are in the cart and
// the items subtotal. Kept free of React/localStorage so it can be tested.
//
// `lines` counts cart lines, not quantity — a 2.5 kg line is one item, not
// "2.5 items". The subtotal is rounded to the rupee exactly like the cart
// page's own subtotal, so the bar never disagrees with the checkout screen.
// Platform fee and delivery are added at checkout and deliberately left out.

type SummaryLine = { qty: number; pricePerKg?: number }

export type CartSummary = { lines: number; subtotal: number }

export function summarizeCart(items: SummaryLine[]): CartSummary {
  const subtotal = Math.round(items.reduce((s, it) => s + (it.pricePerKg ?? 0) * it.qty, 0))
  return { lines: items.length, subtotal }
}

// True when the cart gained something — a new line, or more of an existing
// one. Drives the one-shot "added" bump; removals and qty decreases stay quiet.
export function cartGrew(prev: Record<string, { qty: number }>, next: Record<string, { qty: number }>): boolean {
  return Object.entries(next).some(([key, line]) => line.qty > (prev[key]?.qty ?? 0))
}
