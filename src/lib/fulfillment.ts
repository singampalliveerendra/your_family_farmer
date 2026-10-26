// How a cart line is fulfilled: picked up at the farm or home-delivered by our
// rider. The farmer decides per produce what's allowed
// (produce_listings.delivery_mode: 'pickup' | 'courier' | 'both'); the buyer
// makes ONE choice for the whole order, and only lines that can't follow it
// fall back to the other way (and get flagged in the cart).

export type DeliveryMode = 'pickup' | 'courier' | 'both'
export type Fulfillment = 'self_pickup' | 'home_delivery'

// Unknown / missing reads as 'both', matching how the cart always treated it.
export function normalizeDeliveryMode(raw: unknown): DeliveryMode {
  return raw === 'pickup' || raw === 'courier' ? raw : 'both'
}

export const canPickup = (mode: DeliveryMode) => mode !== 'courier'
export const canDeliver = (mode: DeliveryMode) => mode !== 'pickup'

const allows = (mode: DeliveryMode, f: Fulfillment) =>
  f === 'home_delivery' ? canDeliver(mode) : canPickup(mode)

// The order-wide choice actually in force. If NOTHING in the cart can go the
// way the buyer picked (e.g. Home delivery on an all-pickup-only cart), it
// flips to the other — there is no point offering a choice nothing honours.
export function effectiveFulfillment(preferred: Fulfillment, modes: DeliveryMode[]): Fulfillment {
  if (modes.length === 0 || modes.some((m) => allows(m, preferred))) return preferred
  return preferred === 'home_delivery' ? 'self_pickup' : 'home_delivery'
}

// One line's fulfillment under the order-wide choice. Every mode allows at
// least one way, so the fallback is always valid.
export function lineFulfillment(orderChoice: Fulfillment, mode: DeliveryMode): Fulfillment {
  if (allows(mode, orderChoice)) return orderChoice
  return orderChoice === 'home_delivery' ? 'self_pickup' : 'home_delivery'
}

// Whether a produce can't follow `choice` (true when it's pickup-only and the
// buyer chose delivery, or delivery-only under pickup). These are the lines the
// cart highlights.
export const isException = (orderChoice: Fulfillment, mode: DeliveryMode) =>
  lineFulfillment(orderChoice, mode) !== orderChoice
