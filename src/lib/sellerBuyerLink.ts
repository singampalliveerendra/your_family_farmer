import { normalizePhone } from './phone'
import type { SellerRole } from './buyerView'

/* The rules behind linking a seller account to a buyer account — the server
 * half of the buyer-view switch (see src/lib/buyerView.ts).
 *
 * `farmers` and `consumers_auth` are separate tables with separate passwords,
 * and the phone number is the only thing that ties a person across them. So
 * the switch resolves the seller's phone to a buyer row: reusing theirs if they
 * already shop here, and otherwise creating one on the spot.
 *
 * The created row carries NO password. That is what keeps the shortcut from
 * becoming a second front door — nobody can log into it with a password,
 * because there is no password to guess (`verifyPassword` is never reached:
 * the login route rejects a falsy hash outright). The owner can turn it into a
 * full buyer account whenever they want, either by signing up with that phone
 * (the register route adopts the row instead of refusing it) or through the
 * usual forgot-password OTP, which sets a hash on the same row.
 *
 * Reusing an EXISTING buyer row is the delicate case: it hands the seller a
 * session on an account they did not type a password for. It is sound because
 * both accounts are reached only by proving control of the same phone number —
 * a seller signs in with a password sent to that number, and the buyer account
 * was registered against it. A different person on the same number is the same
 * trust boundary the forgot-password flow already lives on.
 */

/** password_hash for a buyer row created by the switch: empty, never matchable. */
export const LINKED_ACCOUNT_NO_PASSWORD = ''

/** A buyer row nobody can log into with a password — created by the switch, or
 *  legacy data with a blank hash. Such a row is safe to adopt at sign-up. */
export function isPasswordless(hash: string | null | undefined): boolean {
  return !hash || hash.trim() === ''
}

/** Which seller surface the switch was made from. Rows predating aggregators
 *  carry no account_type at all, and those are farmers. */
export function sellerRole(accountType: string | null | undefined): SellerRole {
  return accountType === 'aggregator' ? 'aggregator' : 'farmer'
}

export type BuyerProfile = { name: string; phone: string }

export type BuyerProfileResult =
  | { ok: true; profile: BuyerProfile }
  | { ok: false; error: string }

/**
 * The buyer profile to link a seller to, derived from their farm profile.
 *
 * The phone is the join key, so a seller without a usable one cannot be
 * switched at all — better a clear message than a buyer account keyed to
 * nothing. The name is only a display label; a blank one still shops fine.
 */
export function buyerProfileForSeller(seller: {
  name?: string | null
  phone?: string | null
}): BuyerProfileResult {
  const phone = normalizePhone(seller.phone)
  if (!phone) {
    return {
      ok: false,
      error: 'Add a 10-digit phone number to your farm profile before shopping as a buyer.',
    }
  }
  return { ok: true, profile: { name: (seller.name ?? '').trim().slice(0, 80) || 'Buyer', phone } }
}

/**
 * Is this buyer the same person as the seller they are ordering from?
 *
 * The buyer view puts a seller one tap away from their own listing — previewing
 * it is half the point — so "add to cart" on your own harvest is an easy
 * mis-tap, and it would place a real order: stock decremented, platform fee
 * charged, a pending order the seller has to approve for themselves.
 *
 * Phone is the comparison because it is the same key the two accounts are
 * linked by, and it holds even for a seller who registered as a buyer on their
 * own before the switch existed. Both sides are normalised: farm rows store the
 * number in every format five years of data entry produced.
 */
export function isSelfOrder(
  buyerPhone: string | null | undefined,
  sellerPhone: string | null | undefined,
): boolean {
  const buyer = normalizePhone(buyerPhone)
  const seller = normalizePhone(sellerPhone)
  return buyer !== '' && buyer === seller
}
