// Column lists for `orders`, kept in ONE place because they are now the
// contract between the API routes and the screens that consume them.
//
// Why this file exists: the browser used to read `orders` directly with the
// anon key, so the column list lived wherever the query happened to be. Those
// reads have moved behind /api/farmer/orders*, which query with the service
// role — but the shapes still have to agree, and a column added to one screen
// and forgotten in the route is a silently-missing field rather than an error.
//
// Each list is ONE single-quoted literal on purpose. Joining or concatenating
// widens the type to `string`, which makes supabase-js degrade every consumer
// to GenericStringError — the same trap src/lib/farmerColumns.ts documents.

/** Everything the farmer's FarmerOrder shape needs (list + dashboard). */
export const FARMER_ORDER_COLUMNS =
  'id, farmer_id, order_code, produce_listing_id, harvest_id, harvest:harvests(harvested_at, shelf_life_days), produce_name, quantity, unit, total_price, delivery_fee, platform_fee, buyer_name, buyer_phone, pickup_location, pickup_phone, status, payment_method, payment_status, cod_deposit, cod_balance_due, utr_number, decline_reason, refund_status, refund_amount, refunded_at, delivery_type, delivery_status, delivery_boy_id, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, collected_at, shipped_at, received_at, fulfillment_date, created_at, acknowledged_at'

/**
 * The order-detail screen. Superset of the list: adds the buyer's delivery
 * address (needed to fulfil) and the reschedule reason.
 *
 * handover_otp is deliberately NOT here. The farmer confirms a self-pickup by
 * POSTing the code the buyer reads out to /api/farmer/orders/[id]/confirm-pickup,
 * which compares it server-side. Sending the code TO the farmer would let any
 * farmer close any of their orders without the buyer present.
 */
export const FARMER_ORDER_DETAIL_COLUMNS =
  'id, farmer_id, order_code, produce_name, quantity, unit, total_price, platform_fee, delivery_fee, buyer_name, buyer_phone, pickup_location, pickup_phone, status, payment_method, payment_status, cod_deposit, cod_balance_due, utr_number, decline_reason, refund_status, refund_amount, refunded_at, created_at, confirmed_at, paid_at, delivery_type, delivery_status, delivery_boy_id, delivery_address, delivery_city, delivery_landmark, delivery_pincode, delivery_alt_phone, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, collected_at, shipped_at, received_at, fulfillment_date, acknowledged_at, reschedule_reason, rescheduled_at, harvest_id, harvest:harvests(harvested_at, shelf_life_days)'
