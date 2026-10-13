// The 4-digit handover code a buyer reads out at pickup / the door. Shared by
// the farmer confirm-pickup, farmer deliver and rider deliver routes.
//
// A wrong code is a 400, NEVER a 401. farmerFetch treats every 401 as "the
// login cookie died" and bounces the farmer to /farmer/login?reason=expired —
// so a single mistyped digit used to log the farmer out mid-handover instead of
// showing "Wrong code".

export const WRONG_HANDOVER_CODE = 'Wrong code. Ask the customer to read it again.'

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** null when the code matches; otherwise the error body + status to return. */
export function checkHandoverCode(
  expected: string | null | undefined,
  given: string,
): { error: string; status: 400 } | null {
  if (expected && safeEqual(expected, given)) return null
  return { error: WRONG_HANDOVER_CODE, status: 400 }
}
