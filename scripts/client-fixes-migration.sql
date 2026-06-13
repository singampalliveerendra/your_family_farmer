-- ================================================================
-- YFF Client-Fixes Migration (June 2026 round)
-- Schema changes backing the 15 client-requested fixes.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (idempotent).
-- ================================================================

-- #3 / #9 — Per-order pickup/delivery date the farmer picks per order.
-- The UI labels it "Pickup Date" or "Delivery Date" based on delivery_type.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_date date;
COMMENT ON COLUMN public.orders.fulfillment_date IS 'Farmer-set date for pickup or delivery of this order. Label shown to the consumer depends on delivery_type.';

-- #6 — Friendly payment method label (PhonePe / Google Pay / Paytm / UPI / Card)
-- resolved from the Razorpay payment object. Display-only; payment_method stays
-- 'upi' | 'cod' because app logic branches on it.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method_detail text;
COMMENT ON COLUMN public.orders.payment_method_detail IS 'Friendly payment method label resolved from Razorpay (PhonePe/Google Pay/Paytm/UPI/Card/etc.). Display-only; payment_method stays upi|cod.';

-- #10 — Mandatory reason a moderator gives when suspending a consumer. Shown to
-- the buyer at login and in the moderator console. Cleared on reactivation.
ALTER TABLE public.consumers_auth ADD COLUMN IF NOT EXISTS suspended_reason text;
COMMENT ON COLUMN public.consumers_auth.suspended_reason IS 'Why a moderator suspended this consumer. Shown at login + moderator console; cleared on reactivate.';

-- #11 — Per-listing delivery method. 'pickup' (default) | 'courier' | 'both'.
-- When the farmer offers courier they set a flat charge (₹) and a radius (km).
ALTER TABLE public.produce_listings ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'pickup';
ALTER TABLE public.produce_listings ADD COLUMN IF NOT EXISTS delivery_charge numeric;
ALTER TABLE public.produce_listings ADD COLUMN IF NOT EXISTS delivery_radius_km numeric;
COMMENT ON COLUMN public.produce_listings.delivery_mode IS 'pickup | courier | both — how the farmer fulfils this listing (#11).';
