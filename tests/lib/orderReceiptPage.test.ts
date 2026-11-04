import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The receipt page must only ever show the logged-in seller's own order.
const PAGE = readFileSync(join(process.cwd(), 'src/app/farmer/dashboard/orders/[id]/receipt/page.tsx'), 'utf8')

describe('order receipt page', () => {
  it('reads the order through the cookie-scoped farmer API, never the orders table', () => {
    expect(PAGE).toMatch(/\/api\/farmer\/orders\/\$\{id\}/)
    expect(PAGE).not.toMatch(/from\(\s*['"]orders['"]\s*\)/)
  })
  it('checks the farmer session first', () => {
    expect(PAGE).toMatch(/requireFarmerSession\(\)/)
  })
  it('reads only public profile columns of the seller (never password or bank fields)', () => {
    const sel = PAGE.match(/from\('farmers'\)\.select\('([^']+)'\)/)
    expect(sel?.[1]).toBe('name, village, phone, account_type')
  })
  it('builds every number with src/lib/orderReceipt.ts', () => {
    expect(PAGE).toMatch(/buildOrderReceipt\(/)
  })
  it('prints only the receipt, on one A4 sheet', () => {
    expect(PAGE).toMatch(/@page \{ size: A4/)
    expect(PAGE).toMatch(/:not\(:has\(#yff-receipt\)\)/)
  })
})

describe('receipt buttons', () => {
  it.each([
    'src/app/farmer/dashboard/orders/[id]/page.tsx',
    'src/components/farmer/OrderCard.tsx',
  ])('%s links to the receipt', (f) => {
    expect(readFileSync(join(process.cwd(), f), 'utf8')).toMatch(/\/farmer\/dashboard\/orders\/\$\{order\.id\}\/receipt/)
  })
})
