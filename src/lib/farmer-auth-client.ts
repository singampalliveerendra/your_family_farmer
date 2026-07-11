'use client'

// Client-side farmer auth. The ONLY source of truth for "am I logged in" is the
// HTTP-only `yff_farmer` cookie, which lives on the server. localStorage holds
// a copy of the farmer id purely so pages can query Supabase without a
// round-trip — it is a cache, not a credential.
//
// Those two can drift: the cookie expires (or gets cleared by the browser)
// while localStorage keeps the id forever. That drift is what showed the farmer
// a working dashboard whose every action answered "Please log in." Both entry
// points below close it — `requireFarmerSession()` on page load, `farmerFetch()`
// on every write — by sending the farmer to the login page instead of leaving
// them on a screen where nothing works.

const ID_KEY = 'yff_farmer_id'
const SLUG_KEY = 'yff_farmer_slug'

/** Thrown by `farmerFetch` when the server rejected us with a 401. A redirect
 *  to the login page is already under way; callers should just bail out. */
export class FarmerSessionExpiredError extends Error {
  constructor() {
    super('Farmer session expired')
    this.name = 'FarmerSessionExpiredError'
  }
}

export function isFarmerSessionExpired(e: unknown): boolean {
  return e instanceof FarmerSessionExpiredError
}

export function clearFarmerLocalSession(): void {
  localStorage.removeItem(ID_KEY)
  localStorage.removeItem(SLUG_KEY)
}

// Two parallel requests can both 401. Redirect once.
let redirecting = false

export function goToFarmerLogin(reason: 'expired' | 'required' = 'expired'): void {
  if (redirecting) return
  redirecting = true
  clearFarmerLocalSession()
  const next = window.location.pathname + window.location.search
  const qs = new URLSearchParams({ reason, next })
  // location.replace, not router.replace: a hard load drops the stale in-memory
  // state of the page we're leaving, and keeps the dead page out of history.
  window.location.replace(`/farmer/login?${qs.toString()}`)
}

/**
 * Resolve the logged-in farmer id, verified against the session cookie.
 * Redirects to the login page and resolves to null when there is no session.
 *
 * The cookie decides, not localStorage — so a farmer whose browser evicted
 * localStorage but kept the cookie stays logged in, and one whose cookie died
 * gets sent to login instead of a dashboard that 401s on every tap.
 *
 * On a network failure we fall back to the cached id rather than logging the
 * farmer out: dropping someone on flaky 4G is worse than letting them read a
 * page whose writes would 401 anyway (and `farmerFetch` catches that).
 */
export async function requireFarmerSession(): Promise<string | null> {
  const cachedId = localStorage.getItem(ID_KEY)

  let res: Response
  try {
    res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
  } catch {
    if (cachedId) return cachedId
    goToFarmerLogin('required')
    return null
  }

  const farmer = res.ok
    ? ((await res.json().catch(() => ({}))).farmer as { id: string; slug?: string | null } | null | undefined)
    : undefined

  if (!res.ok && cachedId) return cachedId

  if (!farmer?.id) {
    goToFarmerLogin(cachedId ? 'expired' : 'required')
    return null
  }

  // Re-seed the cache from the cookie whenever they disagree.
  if (farmer.id !== cachedId) {
    localStorage.setItem(ID_KEY, farmer.id)
    if (farmer.slug) localStorage.setItem(SLUG_KEY, farmer.slug)
  }
  return farmer.id
}

/**
 * fetch() for farmer-authenticated endpoints. Always sends the session cookie,
 * never serves the response from cache, and turns a 401 into a login redirect
 * instead of an alert the farmer can't act on.
 */
export async function farmerFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store' })
  if (res.status === 401) {
    goToFarmerLogin('expired')
    throw new FarmerSessionExpiredError()
  }
  return res
}
