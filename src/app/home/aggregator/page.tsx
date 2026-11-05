import type { Metadata } from 'next'
import SubscribeHighlight from '@/components/aggregator/SubscribeHighlight'
import RoleExplainer from '@/components/home/RoleExplainer'
import AggregatorPlans from '@/components/home/AggregatorPlans'
import { AGGREGATOR_CONTENT } from '@/lib/roleContent'
import { activePlans } from '@/lib/publicPlans'
import { farmShots } from '@/lib/farmShots'

/* /home/aggregator — what an aggregator is, the Buying / Selling / Combined
 * plans with live prices and offers, the terms, then signup or login
 * (model agreed 2026-11-04). Public, cached 5 minutes; the offer maths runs in
 * the browser so a cached page never shows an ended offer's price. */

export const metadata: Metadata = {
  title: 'Go Grameen for aggregators — plans & offers',
  description: 'Buy bulk produce straight from farmers and resell on Go Grameen. See Buying, Selling and Combined plans and current offers.',
  openGraph: {
    title: 'Go Grameen for aggregators — plans & offers',
    description: 'Buy in bulk from farmers. Sell retail, wholesale or both. See plans and current offers.',
  },
}

export const revalidate = 300

export default async function AggregatorHomePage() {
  const [plans, photos] = await Promise.all([activePlans(), farmShots(4)])
  return (
    <RoleExplainer content={AGGREGATOR_CONTENT} photos={photos} banner={<SubscribeHighlight plans={plans} where="intro" href="#plans" />}>
      <AggregatorPlans plans={plans} />
    </RoleExplainer>
  )
}
