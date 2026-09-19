import { normalizePhone } from './phone'
import { SELLER_LOGIN } from './entryRole'

/* Default dashboard — which surface `/` opens on for a signed-in person.
 *
 * Stored in the DATABASE, not a cookie, because it has to follow the account
 * to a second phone. `yff_entry` (src/lib/entryRole.ts) already remembers a
 * per-device choice made at install time; this is the account-level choice
 * made in Settings, and it wins over the device one whenever someone is
 * signed in.
 *
 * Keyed by PHONE, not by an account id. `farmers` and `consumers_auth` are
 * separate tables with separate ids, and the phone is the only thing that ties
 * one person across them (see src/lib/sellerBuyerLink.ts). Keying by phone
 * means a farmer who sets "Consumer" on their dashboard sees the same setting
 * in the shop's ⚙️ menu, and the same answer comes back whichever of the two
 * sessions `/` happens to find.
 */

export type DefaultDashboard = 'farmer' | 'consumer'

export const DEFAULT_DASHBOARDS: readonly DefaultDashboard[] = ['farmer', 'consumer']

export function parseDefaultDashboard(raw: unknown): DefaultDashboard | null {
  return raw === 'farmer' || raw === 'consumer' ? raw : null
}

/**
 * Where `/` sends someone who has a saved default.
 *
 * "Farmer" goes to the dashboard only when the seller session is live; a
 * signed-out seller gets the login form, exactly as `entryDestination` does —
 * the preference must never become a way past the password. Aggregators pick
 * "Farmer" too: /farmer/dashboard forwards them on its own.
 */
export function defaultDashboardDestination(pref: DefaultDashboard, sellerSignedIn: boolean): string {
  if (pref === 'consumer') return '/consumer'
  return sellerSignedIn ? '/farmer/dashboard' : SELLER_LOGIN
}

export type SessionIds = { farmerId?: string | null; consumerId?: string | null }

export type AccountPhoneLookup = {
  farmerPhone: (id: string) => Promise<string | null | undefined>
  consumerPhone: (id: string) => Promise<string | null | undefined>
}

/**
 * The phone the preference is filed under, from whichever session is live.
 *
 * Seller first. A seller in buyer view holds BOTH sessions on the same phone,
 * so the order does not matter there; it matters only on a shared device where
 * two different people are signed in on the two sides, and then the settings
 * screen and `/` must at least agree on whose preference they mean. Both call
 * this, so they do.
 *
 * Falls through to the consumer session when the seller row has no usable
 * phone, rather than filing the preference under nothing.
 */
export async function resolveAccountPhone(
  ids: SessionIds,
  lookup: AccountPhoneLookup,
): Promise<string | null> {
  if (ids.farmerId) {
    const phone = normalizePhone(await lookup.farmerPhone(ids.farmerId))
    if (phone) return phone
  }
  if (ids.consumerId) {
    const phone = normalizePhone(await lookup.consumerPhone(ids.consumerId))
    if (phone) return phone
  }
  return null
}
