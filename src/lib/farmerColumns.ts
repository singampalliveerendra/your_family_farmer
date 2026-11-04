// The `farmers` columns the browser is allowed to see.
// (2026-11-04: phone, farm address, exact location, pickup-point phones and the
// old UPI ID / QR are no longer among them — see FARMER_HIDDEN_COLUMNS.)
//
// `farmers` mixes public profile data (name, village, story) with secrets:
// password_hash, bank_account_number, bank_ifsc and activation_code. The anon
// key ships in every JS bundle, so anything the anon role can SELECT is public
// — a `select('*')` from a client component or an anon-client server component
// hands those four columns to anyone who opens DevTools.
//
// Postgres column-level grants enforce this for real (see
// scripts/farmers-column-lockdown.sql); this list keeps our queries in step
// with the grant so they don't 403. Server code that legitimately needs a
// secret (auth, moderator, admin routes) uses the service-role key and bypasses
// both — it should still name its columns explicitly rather than reach for '*'.
//
// If you add a column to `farmers`: add it here AND to the GRANT if it is safe
// to publish; add it to neither if it is a secret.
//
// Kept as one single-quoted literal on purpose: supabase-js derives the row
// type from the literal type of this string, so building it with .join() or +
// widens it to `string` and every consumer degrades to GenericStringError.
export const FARMER_PUBLIC_COLUMNS = 'id, slug, name, village, district, state, method, farm_size_acres, farming_since_year, story_quote, soil_organic_carbon, soil_ph, brix_reading, water_source, delivery_available, pickup_available, farm_visit_day, rating_avg, rating_count, buyer_count, region_slug, active, created_at, pickup_locations, cover_photo_url, photo_url, pesticide_cert_url, pickup_slots, location_name, cod_enabled, registered_by_moderator, facebook_url, instagram_url, youtube_url, account_type, contact_person, how_we_aggregate, business_cert_url, organic_certificate_url, terms_accepted_at, approval_status'

/**
 * The seller's OWN profile, read only by the server for the logged-in seller
 * (/api/farmer/profile). The public list above minus nothing, plus what is
 * hidden from everyone else since the security fix (2026-11-04): phone, farm
 * address, exact location and pickup-point phones. Never sent to anyone but
 * the seller themselves (and moderators, through their own routes).
 */
export const FARMER_SELF_COLUMNS = 'id, slug, name, village, district, state, method, farm_size_acres, farming_since_year, story_quote, soil_organic_carbon, soil_ph, brix_reading, water_source, delivery_available, pickup_available, farm_visit_day, rating_avg, rating_count, buyer_count, region_slug, active, created_at, pickup_locations, cover_photo_url, photo_url, pesticide_cert_url, pickup_slots, location_name, cod_enabled, registered_by_moderator, facebook_url, instagram_url, youtube_url, account_type, contact_person, how_we_aggregate, business_cert_url, organic_certificate_url, terms_accepted_at, approval_status, phone, farm_address, lat, lng, pickup_location_phones'

/**
 * Hidden from the public key since the security fix (2026-11-04): a farmer's
 * phone, farm address, exact location, pickup-point phones, and the old UPI ID
 * / QR (payouts use Payout details now). Only an aggregator with a Buying plan
 * (bulk market), the buyer on their own order, moderators and the farmer see
 * them — all through server routes. scripts/seller-writes-lockdown.sql revokes
 * exactly these from anon.
 */
export const FARMER_HIDDEN_COLUMNS = ['phone', 'farm_address', 'lat', 'lng', 'pickup_location_phones', 'upi_id', 'upi_qr_code_url'] as const
