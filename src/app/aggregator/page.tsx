import { redirect } from 'next/navigation'

// /aggregator is the address people type and share; without this it 404s, since
// only /aggregator/signup and /aggregator/dashboard exist.
//
// Points at the dashboard rather than the login page (the farmer equivalent's
// choice) because a signed-in aggregator typing the bare URL wants their
// dashboard. It degrades safely for everyone else: the dashboard verifies the
// session cookie and sends a logged-out visitor to /farmer/login, and a plain
// farmer who lands there is redirected to /farmer/dashboard.
export default function AggregatorIndex() {
  redirect('/aggregator/dashboard')
}
