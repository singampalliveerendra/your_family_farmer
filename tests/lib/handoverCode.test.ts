import { describe, it, expect } from 'vitest'
import { checkHandoverCode, WRONG_HANDOVER_CODE } from '@/lib/handoverCode'

describe('checkHandoverCode', () => {
  it('accepts the matching code', () => {
    expect(checkHandoverCode('4821', '4821')).toBeNull()
  })

  // The bug: a wrong code came back as 401, which farmerFetch reads as an
  // expired login and redirects to "Your session ended". It must not be 401.
  it('rejects a wrong code with 400, not 401', () => {
    const r = checkHandoverCode('4821', '4822')
    expect(r).toEqual({ error: WRONG_HANDOVER_CODE, status: 400 })
    expect(r?.status).not.toBe(401)
  })

  it('rejects when the order has no code on file', () => {
    expect(checkHandoverCode(null, '0000')?.status).toBe(400)
    expect(checkHandoverCode(undefined, '0000')?.status).toBe(400)
    expect(checkHandoverCode('', '')?.status).toBe(400)
  })

  it('rejects a code of a different length', () => {
    expect(checkHandoverCode('4821', '482')?.status).toBe(400)
  })
})
