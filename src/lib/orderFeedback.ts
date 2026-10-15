// Who may rate an order, and whether that rating is public.
//
// A buyer can rate and review ANY of their own orders — pending, approved,
// shipped, delivered, declined or cancelled. Only the order's produce link
// matters: a rating is stored against a produce listing, so an order without
// one has nothing to rate.
//
// Whether the rating is PUBLIC is a separate question. Only a completed order
// (delivered / picked up / received, and not declined or cancelled) yields a
// verified-buyer rating that is shown on the produce card and counts toward its
// star average. Feedback on any other order is kept private (approved = false)
// so a buyer who never received the produce can't move its public rating.
// Shared by the order card, the order detail page and /api/produce-reviews so
// all three agree.

type FeedbackOrder = {
  status: string
  produce_listing_id?: string | null
  delivery_status?: string | null
  received_at?: string | null
  collected_at?: string | null
  delivered_at?: string | null
}

export const isOrderCompleted = (o: FeedbackOrder) =>
  o.status !== 'declined'
  && o.status !== 'cancelled'
  && (o.delivery_status === 'delivered' || !!o.collected_at || !!o.received_at || !!o.delivered_at)

export const canGiveFeedback = (o: FeedbackOrder) => !!o.produce_listing_id
