import { describe, it, expect } from 'vitest'
import { validatePayout, maskAccountNumber } from '@/lib/payout'

// Payout accounts are how a farmer actually gets paid. A typo that survives
// validation is money wired into someone else's account, and a leaked account
// number is a real-world harm to a real farmer. This is also why these fields
// live in payout_accounts (service-role only) and never on the world-readable
// farmers table.

describe('validatePayout', () => {
  // USE: the ordinary happy path, and proof that the values written to the DB
  // are the CLEANED ones — a mistyped lowercase IFSC must be stored uppercase
  // or the bank rejects the transfer.
  it('accepts a well-formed account and returns cleaned values', () => {
    const res = validatePayout({
      account_holder_name: '  Lakshmi Devi ',
      account_number: '123456789012',
      ifsc: 'sbin0001234',
      upi_id: 'lakshmi@ybl',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value).toEqual({
      account_holder_name: 'Lakshmi Devi',
      account_number: '123456789012',
      ifsc: 'SBIN0001234',
      upi_id: 'lakshmi@ybl',
    })
  })

  // USE: farmers type account numbers off a passbook, with the spaces and
  // dashes printed there. Rejecting that formatting would make a correct
  // number look wrong to the person entering it.
  it('accepts an account number typed with spaces or dashes', () => {
    const res = validatePayout({
      account_holder_name: 'Ravi',
      account_number: '1234 5678-9012',
      ifsc: 'HDFC0001234',
      upi_id: '',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.account_number).toBe('123456789012')
  })

  // USE: a bank transfer cannot be made without a holder name, and the old
  // farmers.bank_account_number column never captured one. Whitespace must not
  // pass as a name.
  it('demands a holder name, and does not accept blank space as one', () => {
    expect(validatePayout({ account_holder_name: '   ', account_number: '123456789012', ifsc: 'SBIN0001234' }))
      .toMatchObject({ ok: false })
  })

  // USE: Indian account numbers run roughly 9-18 digits. Both a truncated
  // number and one with a stray digit are money sent nowhere.
  it('rejects an account number that is too short, too long, or not digits', () => {
    const bad = ['12345678', '1234567890123456789', 'ABCD12345678', '']
    for (const account_number of bad) {
      expect(validatePayout({ account_holder_name: 'Ravi', account_number, ifsc: 'SBIN0001234' }))
        .toMatchObject({ ok: false })
    }
  })

  // USE: IFSC has a fixed shape (4 letters, a 0, then 6 alphanumerics). A wrong
  // one routes to the wrong branch, and the error message shows the farmer an
  // example so they can fix it without support.
  it('enforces the IFSC shape and explains the format', () => {
    const res = validatePayout({ account_holder_name: 'Ravi', account_number: '123456789012', ifsc: 'SBI0001234' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('SBIN0001234')
    expect(validatePayout({ account_holder_name: 'Ravi', account_number: '123456789012', ifsc: 'SBIN1001234' }))
      .toMatchObject({ ok: false })
  })

  // USE: UPI is optional — many farmers only have a bank account. Requiring it
  // would lock those farmers out of getting paid at all.
  it('treats a missing UPI id as optional and stores it as null', () => {
    const res = validatePayout({ account_holder_name: 'Ravi', account_number: '123456789012', ifsc: 'SBIN0001234' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.upi_id).toBeNull()
  })

  // USE: but a UPI id that IS supplied must be usable. A half-typed handle
  // saved as-is fails silently at payout time, days later.
  it('rejects a malformed UPI id when one is given', () => {
    for (const upi_id of ['lakshmi', 'lakshmi@', '@ybl', 'lak shmi@ybl']) {
      expect(validatePayout({ account_holder_name: 'Ravi', account_number: '123456789012', ifsc: 'SBIN0001234', upi_id }))
        .toMatchObject({ ok: false })
    }
  })

  // USE: these fields arrive as JSON from a phone. Numbers, nulls and objects
  // must be rejected cleanly, never throw a 500 out of the payout route.
  it('survives non-string input without throwing', () => {
    expect(validatePayout({ account_holder_name: 123, account_number: null, ifsc: {}, upi_id: [] }))
      .toMatchObject({ ok: false })
  })
})

describe('maskAccountNumber', () => {
  // USE: once saved, the account number is never shown back in full. A stolen
  // session or a shoulder-surfed dashboard must not yield a farmer's bank
  // account; the last four digits are enough for them to recognise it.
  it('shows only the last four digits', () => {
    expect(maskAccountNumber('123456789012')).toBe('••••9012')
    expect(maskAccountNumber('1234 5678 9012')).toBe('••••9012')
  })

  // USE: a short or empty value must mask to dots rather than leaking whatever
  // it holds.
  it('leaks nothing when there is too little to mask', () => {
    expect(maskAccountNumber('12')).toBe('••••')
    expect(maskAccountNumber('')).toBe('••••')
  })
})
