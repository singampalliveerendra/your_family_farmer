// Payout account details for farmers and aggregators.
//
// These live in `payout_accounts`, never on `farmers`. That table is
// world-readable and anon-writable, and RLS cannot hide columns — bank details
// there would be public, and rewritable by a stranger. payout_accounts has RLS
// enabled with no policy, so only the service-role key reaches it.
//
// Payout is manual: we receive payment, work out the shares and transfer by
// hand. Nothing here touches the order or payment flow.

// Same shapes the moderator farmer route validates against. Kept here so the
// payout path has one definition; the moderator route still carries its own
// copy and can be pointed at these later.
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/

// Indian bank account numbers run roughly 9–18 digits depending on the bank, so
// validate the shape rather than a fixed length.
export const ACCOUNT_NUMBER_RE = /^[0-9]{9,18}$/

export type PayoutInput = {
  account_holder_name: string
  account_number: string
  ifsc: string
  upi_id: string | null
}

/**
 * Last four digits only, e.g. "••••3421". The farmer never gets the full number
 * back once saved — changing it means retyping it, which is the trade we make so
 * a stolen session can't read an account number out of the dashboard.
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '')
  if (digits.length < 4) return '••••'
  return `••••${digits.slice(-4)}`
}

/**
 * Normalises and validates a submitted payout account. Returns either the
 * cleaned values ready to write, or the first human-readable error.
 */
export function validatePayout(raw: {
  account_holder_name?: unknown
  account_number?: unknown
  ifsc?: unknown
  upi_id?: unknown
}): { ok: true; value: PayoutInput } | { ok: false; error: string } {
  const holder = String(raw.account_holder_name ?? '').trim()
  // Spaces and dashes are how people naturally type an account number.
  const account = String(raw.account_number ?? '').replace(/[\s-]/g, '')
  const ifsc = String(raw.ifsc ?? '').trim().toUpperCase()
  const upi = String(raw.upi_id ?? '').trim()

  // Required, because a bank transfer cannot be made without it and the old
  // farmers.bank_account_number column never captured it.
  if (!holder) {
    return { ok: false, error: 'Account holder name is required.' }
  }
  if (!ACCOUNT_NUMBER_RE.test(account)) {
    return { ok: false, error: 'Enter a valid account number (9–18 digits).' }
  }
  if (!IFSC_RE.test(ifsc)) {
    return { ok: false, error: 'Invalid IFSC. Example: SBIN0001234' }
  }
  if (upi && !UPI_RE.test(upi)) {
    return { ok: false, error: 'Invalid UPI ID. Example: name@ybl' }
  }

  return {
    ok: true,
    value: {
      account_holder_name: holder,
      account_number: account,
      ifsc,
      upi_id: upi || null,
    },
  }
}
