import { Suspense } from 'react'
import SellerLoginForm from '@/components/SellerLoginForm'

// Aggregator login. Shares every line of its logic with /farmer/login via
// SellerLoginForm; the only difference is that /api/auth/login is told to
// accept aggregator accounts only, and that a farmer who lands here is sent to
// the farmer login rather than being told their password is wrong.
export default function AggregatorLoginPage() {
  return (
    <Suspense fallback={null}>
      <SellerLoginForm accountType="aggregator" />
    </Suspense>
  )
}
