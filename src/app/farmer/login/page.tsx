import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SellerLoginForm from '@/components/SellerLoginForm'
import { FARMER_SESSION_COOKIE_NAME, verifyFarmerSessionToken } from '@/lib/farmer-session'

// The form itself lives in SellerLoginForm, shared with /aggregator/login —
// same accounts table, same cookie, same validation, only the wording and the
// sign-up/dashboard links differ.
//
// Nobody who is already signed in should ever be shown this form: the session
// cookie lasts 30 days, so re-typing a password is pure friction. A seller with
// a live cookie is sent to the dashboard instead (which forwards aggregators to
// their own URL). Three cases still render the form:
//   ?reason= / ?next=  farmerFetch bounced them here — the cookie is dead or
//                      about to be, and re-entering it is the whole point
//   ?switch=1          they deliberately want to sign in as another account
export const dynamic = 'force-dynamic'

export default async function FarmerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string; switch?: string }>
}) {
  const [store, params] = await Promise.all([cookies(), searchParams])
  const bouncedHere = Boolean(params.reason || params.next) || params.switch === '1'

  if (!bouncedHere && verifyFarmerSessionToken(store.get(FARMER_SESSION_COOKIE_NAME)?.value)) {
    redirect('/farmer/dashboard')
  }

  return (
    <Suspense fallback={null}>
      <SellerLoginForm accountType="farmer" />
    </Suspense>
  )
}
