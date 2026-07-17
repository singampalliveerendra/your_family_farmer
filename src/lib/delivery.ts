// Shared vocabulary for the home-delivery rider flow.
//
// The rider's routes are the only thing that move a home delivery along:
//   accept → delivery_status 'assigned',         assigned_at
//   pickup → delivery_status 'picked_up',        picked_up_at
//   out    → delivery_status 'out_for_delivery', out_for_delivery_at
//   deliver→ delivery_status 'delivered',        delivered_at
// The farmer's shipped_at / received_at are NEVER stamped on a rider order, so
// anything asking "where is this delivery?" has to read delivery_status. Both
// farmer surfaces (order card + order detail) go through here so their wording
// and their notion of progress can't drift apart again.

export type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

/** Rider stages in the order they happen. Index = how far along the delivery is. */
export const DELIVERY_STAGES: DeliveryStatus[] = [
  'unassigned', 'assigned', 'picked_up', 'out_for_delivery', 'delivered',
]

/** True once `current` has reached (or passed) `target`. */
export function deliveryReached(current: DeliveryStatus | null | undefined, target: DeliveryStatus): boolean {
  return DELIVERY_STAGES.indexOf(current ?? 'unassigned') >= DELIVERY_STAGES.indexOf(target)
}

/**
 * Is this order being handled by a rider?
 * A home delivery with no rider assigned is farmer-fulfilled — the farmer taps
 * Shipped and the buyer confirms receipt — so it is NOT the rider flow.
 */
export function isRiderFlow(o: {
  delivery_type?: string | null
  delivery_status?: DeliveryStatus | null
}): boolean {
  return o.delivery_type === 'home_delivery'
    && o.delivery_status != null
    && o.delivery_status !== 'unassigned'
}

/**
 * Has the produce physically left the farmer's hands?
 * Rider orders close at the buyer's door (delivery_status 'delivered'); farmer
 * flows close when the buyer confirms (received_at) or collects (collected_at).
 */
export function isHandedOver(o: {
  delivery_status?: DeliveryStatus | null
  received_at?: string | null
  collected_at?: string | null
}): boolean {
  return o.delivery_status === 'delivered' || !!o.received_at || !!o.collected_at
}

export type DeliveryStageCopy = {
  /** Short status, e.g. "Picked up". */
  title: string
  /** One plain sentence telling the farmer what is happening right now. */
  body: string
  /** When this stage happened, if known. */
  at: string | null
}

type StageOrder = {
  delivery_status?: DeliveryStatus | null
  assigned_at?: string | null
  picked_up_at?: string | null
  out_for_delivery_at?: string | null
  delivered_at?: string | null
  received_at?: string | null
}

/**
 * The farmer-facing description of where a home delivery has got to.
 *
 * @param who  the rider's name, or a neutral noun while the contact is loading
 * @param L    the caller's translator (en, te) from useLang()
 */
export function farmerDeliveryStage(
  o: StageOrder,
  who: string,
  L: (en: string, te: string) => string,
): DeliveryStageCopy {
  switch (o.delivery_status ?? 'unassigned') {
    case 'assigned':
      return {
        title: L('Rider assigned', 'రైడర్ కేటాయించారు'),
        body: L(
          `${who} has accepted this order and will come to collect it from you. Call to fix a time.`,
          `${who} ఈ ఆర్డర్‌ను తీసుకున్నారు, దానిని మీ వద్ద నుండి తీసుకెళ్లడానికి వస్తారు. సమయం మాట్లాడటానికి కాల్ చేయండి.`,
        ),
        at: o.assigned_at ?? null,
      }
    case 'picked_up':
      return {
        title: L('Picked up', 'తీసుకెళ్లారు'),
        body: L(
          `${who} has collected this order from you and is taking it to the buyer.`,
          `${who} ఈ ఆర్డర్‌ను మీ వద్ద నుండి తీసుకున్నారు, కొనుగోలుదారుకు తీసుకెళ్తున్నారు.`,
        ),
        at: o.picked_up_at ?? null,
      }
    case 'out_for_delivery':
      return {
        title: L('Out for delivery', 'డెలివరీకి బయలుదేరారు'),
        body: L(
          `${who} is on the way to the buyer's address now.`,
          `${who} ఇప్పుడు కొనుగోలుదారు చిరునామాకు వెళ్తున్నారు.`,
        ),
        at: o.out_for_delivery_at ?? null,
      }
    case 'delivered':
      return {
        title: L('Delivered', 'డెలివరీ అయింది'),
        body: L(
          `${who} handed this order to the buyer. Nothing more for you to do.`,
          `${who} ఈ ఆర్డర్‌ను కొనుగోలుదారుకు అందించారు. మీరు చేయాల్సింది ఏమీ లేదు.`,
        ),
        at: o.delivered_at ?? o.received_at ?? null,
      }
    default:
      return {
        title: L('Waiting for a rider', 'రైడర్ కోసం ఎదురుచూస్తున్నాం'),
        body: L(
          'No delivery boy has accepted this order yet. Their name and number will appear here as soon as one does.',
          'ఇంకా ఏ డెలివరీ బాయ్ ఈ ఆర్డర్‌ను తీసుకోలేదు. ఎవరైనా తీసుకున్న వెంటనే వారి పేరు, నంబర్ ఇక్కడ కనిపిస్తాయి.',
        ),
        at: null,
      }
  }
}

/** Short "when" label for a stage timestamp, e.g. "16 Jul, 04:20 pm". */
export function formatStageAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
