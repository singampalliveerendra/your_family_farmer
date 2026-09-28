import { describe, it, expect, vi } from 'vitest'
import {
  defaultDashboardDestination,
  parseDefaultDashboard,
  resolveAccountPhone,
} from '@/lib/defaultDashboard'
import { SELLER_LOGIN } from '@/lib/entryRole'

// Settings → Default dashboard decides where `/` — the installed app's
// start_url — opens for a signed-in person, on every launch.

describe('parseDefaultDashboard', () => {
  it('accepts exactly the two dashboards', () => {
    expect(parseDefaultDashboard('farmer')).toBe('farmer')
    expect(parseDefaultDashboard('consumer')).toBe('consumer')
  })

  // USE: the PUT body is untrusted — anything else must be rejected, not
  // stored and later turned into a redirect.
  it('rejects anything else', () => {
    for (const raw of ['Farmer', 'moderator', '', null, undefined, 1, {}]) {
      expect(parseDefaultDashboard(raw)).toBeNull()
    }
  })
})

describe('defaultDashboardDestination', () => {
  it('opens Consumer on the shop', () => {
    expect(defaultDashboardDestination('consumer', false)).toBe('/consumer')
    expect(defaultDashboardDestination('consumer', true)).toBe('/consumer')
  })

  it('opens Farmer on the dashboard when the seller session is live', () => {
    expect(defaultDashboardDestination('farmer', true)).toBe('/farmer/dashboard')
  })

  // USE: a saved "Farmer" must never become a way past the seller password.
  it('sends a signed-out seller to the login form', () => {
    expect(defaultDashboardDestination('farmer', false)).toBe(SELLER_LOGIN)
  })
})

describe('resolveAccountPhone', () => {
  const lookup = (farmer: string | null, consumer: string | null) => ({
    farmerPhone: vi.fn(async () => farmer),
    consumerPhone: vi.fn(async () => consumer),
  })

  it('is null with no session at all, without touching the DB', async () => {
    const l = lookup('9876543210', '9876543210')
    expect(await resolveAccountPhone({}, l)).toBeNull()
    expect(l.farmerPhone).not.toHaveBeenCalled()
    expect(l.consumerPhone).not.toHaveBeenCalled()
  })

  // USE: farm rows store phones in loose forms; the key must be the same
  // 10 digits whichever table it came from, or the two sides would diverge.
  it('normalises the seller phone', async () => {
    expect(await resolveAccountPhone({ farmerId: 'f1' }, lookup('+91 98765-43210', null))).toBe('9876543210')
  })

  it('uses the buyer session when there is no seller one', async () => {
    expect(await resolveAccountPhone({ consumerId: 'c1' }, lookup(null, '9123456789'))).toBe('9123456789')
  })

  // USE: the settings screen and `/` both call this, so on a device holding
  // two different people's sessions they still agree on whose setting it is.
  it('prefers the seller session when both are live', async () => {
    const l = lookup('9876543210', '9123456789')
    expect(await resolveAccountPhone({ farmerId: 'f1', consumerId: 'c1' }, l)).toBe('9876543210')
    expect(l.consumerPhone).not.toHaveBeenCalled()
  })

  it('falls through to the buyer session when the seller has no usable phone', async () => {
    expect(
      await resolveAccountPhone({ farmerId: 'f1', consumerId: 'c1' }, lookup('12', '9123456789')),
    ).toBe('9123456789')
  })

  it('is null when no session yields a phone (deleted account)', async () => {
    expect(await resolveAccountPhone({ farmerId: 'f1', consumerId: 'c1' }, lookup(null, null))).toBeNull()
  })
})
