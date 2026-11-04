import type { Metadata } from 'next'
import RoleExplainer from '@/components/home/RoleExplainer'
import { FARMER_CONTENT } from '@/lib/roleContent'
import { farmShots } from '@/lib/farmShots'

/* /home/farmer — what farmers get on Go Grameen (free, always), how it works,
 * the terms, then signup or login (model agreed 2026-11-04). The words live in
 * src/lib/roleContent.ts. Shareable on WhatsApp by moderators. */

export const metadata: Metadata = {
  title: 'Go Grameen for farmers — free, always',
  description: 'Sell your harvest retail to families and in bulk to aggregators. No subscription, no listing fee. You set the price.',
  openGraph: {
    title: 'Go Grameen for farmers — free, always',
    description: 'Sell retail to families and in bulk to aggregators. No subscription, no listing fee.',
  },
}

export const revalidate = 600

export default async function FarmerHomePage() {
  const photos = await farmShots(4)
  return <RoleExplainer content={FARMER_CONTENT} photos={photos} />
}
