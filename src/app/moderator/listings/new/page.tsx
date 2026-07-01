'use client'

import ModeratorShell, { useModeratorAuth } from '../../ModeratorShell'
import ListingForm from '../ListingForm'

export default function NewListingPage() {
  const { zone, checked } = useModeratorAuth()

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Add harvest" subtitle="List a product on a farmer's behalf" zone={zone}>
      <ListingForm mode="create" zone={zone} />
    </ModeratorShell>
  )
}
