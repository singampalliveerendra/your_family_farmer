// Flat delivery fee in rupees for home-delivery orders. Stamped onto the
// first row of a multi-row batch at order placement (see
// src/app/api/orders/place/route.ts), and paid out as rider_payout once
// the order is delivered. Bump this number to reprice; nothing else needs
// to change. 0 means delivery is free for now — cart UI and rider earning
// badges hide themselves when the fee is 0.
export const DELIVERY_FEE_RUPEES = 0
