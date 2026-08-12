import { Suspense } from 'react'
import SellerLoginForm from '@/components/SellerLoginForm'

// The form itself lives in SellerLoginForm, shared with /aggregator/login —
// same accounts table, same cookie, same validation, only the wording and the
// sign-up/dashboard links differ.
export default function FarmerLoginPage() {
  return (
    <Suspense fallback={null}>
      <SellerLoginForm accountType="farmer" />
    </Suspense>
  )
}
