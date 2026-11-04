import type { Metadata } from 'next'
import RoleExplainer from '@/components/home/RoleExplainer'
import { CONSUMER_CONTENT } from '@/lib/roleContent'
import { farmShots } from '@/lib/farmShots'

/* /home/consumer — why a family should shop on Go Grameen, how it works and
 * the simple terms, then straight into the shop. Most buyers skip this (the
 * /home card goes to the shop directly); it is the "why shop here?" link. */

export const metadata: Metadata = {
  title: 'Go Grameen for families — fresh from the farm',
  description: 'Buy fresh produce directly from the farmers who grow it. See who grew it and when it was picked. Pickup or home delivery.',
  openGraph: {
    title: 'Go Grameen for families — fresh from the farm',
    description: 'Buy directly from farmers. See who grew it and when it was picked.',
  },
}

export const revalidate = 600

export default async function ConsumerHomePage() {
  const photos = await farmShots(4)
  return <RoleExplainer content={CONSUMER_CONTENT} photos={photos} />
}
