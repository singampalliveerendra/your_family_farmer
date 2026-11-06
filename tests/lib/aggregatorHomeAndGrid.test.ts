import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planBadge } from '@/lib/planBadge'
import { overlayStepGone } from '@/lib/overlayHistory'

// 2026-11-05 client round: slim plan line + Bulk market / Sell bulk buttons,
// no "Shop as a consumer" card, the bulk market on the consumer grid's tile,
// Back closes overlays (Preview → form) instead of leaving the page, and the
// cart buttons no longer depend on the (now hidden) farmer phone.

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const L = (en: string) => en
const fmt = () => '12 Dec'

describe('plan badge', () => {
  it('free forever just says "Free plan"', () => {
    expect(planBadge({ state: 'forever' }, L, fmt).text).toBe('Free plan')
  })
  it('dated, ending, ended and none say what to do', () => {
    expect(planBadge({ state: 'active', endsAt: 'x', daysLeft: 20 }, L, fmt).text).toBe('Till 12 Dec')
    expect(planBadge({ state: 'ending', endsAt: 'x', daysLeft: 2 }, L, fmt).text).toBe('Renew · 12 Dec')
    expect(planBadge({ state: 'expired', endedAt: 'x', daysSince: 3 }, L, fmt).text).toBe('Renew now')
    expect(planBadge({ state: 'none' }, L, fmt).text).toBe('Choose a plan')
  })
})

describe('aggregator dashboard card', () => {
  const card = src('src/components/farmer/SubscriptionStatusCard.tsx')
  it('has Bulk market and Sell your products buttons, and no Shop as a consumer card', () => {
    expect(card).toMatch(/'Bulk market'/)
    expect(card).toMatch(/'Sell your products'/)
    expect(card).not.toMatch(/L\('Sell bulk'/)
    expect(card).not.toMatch(/L\('Shop as a consumer'/)
    expect(card).not.toMatch(/href="\/consumer"/)
  })
  it('Sell your products opens the normal Add produce (no sale mode picked) — 2026-11-06', () => {
    const dash = src('src/app/farmer/dashboard/page.tsx')
    expect(dash).not.toMatch(/setFormSaleMode\('wholesale'\)/)
    expect(dash).toMatch(/initialSaleMode=\{formSaleMode\}/)
    expect(dash).toMatch(/!editData && initialSaleMode \? \{ \.\.\.f, saleMode: initialSaleMode \}/)
  })
})

describe('Back closes the overlay on top', () => {
  it('a step is gone once history is below it', () => {
    expect(overlayStepGone(null, 1)).toBe(true)
    expect(overlayStepGone({}, 1)).toBe(true)
    expect(overlayStepGone({ yffOverlay: 1 }, 2)).toBe(true)   // preview (2) closes, form (1) stays
    expect(overlayStepGone({ yffOverlay: 1 }, 1)).toBe(false)
    expect(overlayStepGone({ yffOverlay: 3 }, 2)).toBe(false)
  })
  it('the produce form, its Preview, profile edit and My produce all use it', () => {
    const dash = src('src/app/farmer/dashboard/page.tsx')
    expect(dash.match(/useBackToClose\(true, onClose\)/g)?.length).toBe(3)
    expect(dash).toMatch(/useBackToClose\(true, \(\) => close\(\)\)/)
    expect(dash).toMatch(/Back to edit/)
  })
})

describe('the bulk market reuses the consumer grid', () => {
  it('both pages render the shared tile, grid, search box and chip row', () => {
    for (const p of ['src/app/consumer/page.tsx', 'src/app/aggregator/market/page.tsx']) {
      const s = src(p)
      expect(s).toMatch(/<ProduceTile\b/)
      expect(s).toMatch(/PRODUCE_GRID_CLASS/)
      expect(s).toMatch(/<ProduceSearchBox\b/)
      expect(s).toMatch(/<ProduceChipRow\b/)
    }
  })
})

describe('cart buttons never wait for the hidden farmer phone', () => {
  // The security fix (2026-11-04) took the phone out of public data; a card
  // that still required it showed "View" instead of "+ Add" everywhere.
  const PUBLIC = [
    'src/app/consumer/page.tsx', 'src/app/consumer/produce/[id]/page.tsx', 'src/app/consumer/harvest/[harvestId]/page.tsx',
    'src/components/consumer/TodaysHarvest.tsx', 'src/components/consumer/FreshHarvestsTable.tsx', 'src/components/region/tabs/BrowseProduceTab.tsx',
  ]
  it.each(PUBLIC)('%s', (p) => {
    const s = src(p)
    expect(s).not.toMatch(/(canAdd|canCart)\s*=[^\n]*\.phone/)
    expect(s).not.toMatch(/if \(!\w+\??\.phone[^\n]*\) return/)
  })
})

describe('dashboard header has no duplicate Settings / Logout / Edit profile', () => {
  // 2026-11-05: all of it lives in the bottom bar's Settings sheet.
  const dash = src('src/app/farmer/dashboard/page.tsx')
  it('the header links are gone', () => {
    expect(dash).not.toMatch(/\{tx\.editProfile\}/)
    expect(dash).not.toMatch(/\{tx\.logout\}/)
    expect(dash).not.toMatch(/⚙️ \{L\('Settings', 'సెట్టింగ్‌లు'\)\}\n\s*<\/button>/)
  })
  it('the Settings sheet still has Account (edit profile) and Log out', () => {
    expect(dash).toMatch(/setShowSettings\(false\); setShowProfileEdit\(true\)/)
    expect(dash).toMatch(/setShowSettings\(false\); void handleLogout\(\)/)
    expect(dash).toMatch(/useBackToClose\(showSettings/)
  })
})

describe('bulk lot page order', () => {
  it('the seller block comes after Buy this lot', () => {
    const lot = src('src/app/aggregator/market/[id]/page.tsx')
    expect(lot.indexOf('<BulkCheckout')).toBeGreaterThan(0)
    expect(lot.indexOf("'Sold by farmer'")).toBeGreaterThan(lot.indexOf('<BulkCheckout'))
  })
})

describe('My bulk orders lives under the bottom menu Orders (2026-11-06)', () => {
  it('the bulk market no longer has its own My bulk orders button', () => {
    expect(src('src/app/aggregator/market/page.tsx')).not.toMatch(/href="\/aggregator\/purchases"/)
  })
  it('Orders received ↔ My bulk orders tabs on both pages; only aggregators see them on Orders', () => {
    expect(src('src/app/farmer/dashboard/orders/page.tsx')).toMatch(/<AggregatorOrdersTabs active="received" \/>/)
    expect(src('src/app/aggregator/purchases/page.tsx')).toMatch(/<AggregatorOrdersTabs active="bought" alwaysShow \/>/)
    expect(src('src/components/aggregator/OrdersTabs.tsx')).toMatch(/account_type === 'aggregator'/)
  })
})
