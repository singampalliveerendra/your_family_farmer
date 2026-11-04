-- ================================================================
-- YFF Bulk orders: an aggregator buys a bulk lot in the app (Phase 6)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Needs scripts/wholesale-migration.sql first.
-- Safe to run twice (IF NOT EXISTS / DROP ... IF EXISTS).
-- STATUS: applied to STAGING 2026-11-04 (migration `bulk_orders`; 4 good + 6 bad
-- cases probed, rolled back). NOT applied to prod.
-- ================================================================
--
-- produce_listings.wholesale_transport_rates — what the seller charges to
-- deliver a bulk order, per state they deliver to (decision 2026-11-04):
--   { "AP": { "mode": "per_order" | "per_unit", "amount": 500, "free_above": 1000 },
--     "TG": { ... } }
--   mode       per_order = one fixed charge; per_unit = amount × quantity (₹/kg)
--   amount     ₹, 0 allowed (= free delivery)
--   free_above optional: no charge when the order is at least this quantity
-- A state in wholesale_transport_states WITHOUT a rate here is not offered for
-- delivery in the app (pickup only) until the seller sets one — an unset rate
-- is never read as "free".
--
-- orders gains what a bulk purchase needs:
--   buyer_aggregator_id  the aggregator who bought it (a farmers row; consumer_id
--                        stays NULL). The aggregator's "My bulk orders" reads by it.
--   transport_charge     ₹ the seller charges to deliver. INCLUDED in total_price
--                        (the seller receives it), so a farmer's decline refunds it
--                        with the rest; kept separately for receipts.
--   transport_state      'AP' | 'TG' — where it is being delivered (NULL = pickup)
-- A bulk purchase is always wholesale and always paid online (no COD — 2026-11-04).
--
-- platform_settings.bulk_fee_percent — the platform fee on bulk orders, 0% for
-- now, changeable by moderators.
--
-- Security: nothing new is readable with the anon key — orders stays locked,
-- the rates ride on produce_listings like the other wholesale columns.
-- ================================================================

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS wholesale_transport_rates jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_transport_rates_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_transport_rates_check
  CHECK (jsonb_typeof(wholesale_transport_rates) = 'object');

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buyer_aggregator_id uuid REFERENCES public.farmers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_charge    numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_state     text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_charge_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_charge_check
  CHECK (transport_charge >= 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_state_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_state_check
  CHECK (transport_state IS NULL OR transport_state IN ('AP', 'TG'));
-- A bulk purchase is wholesale, online-paid, and not also a household order.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_bulk_purchase_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_bulk_purchase_check
  CHECK (buyer_aggregator_id IS NULL OR (order_type = 'wholesale' AND payment_method = 'cashfree' AND consumer_id IS NULL));

CREATE INDEX IF NOT EXISTS orders_buyer_aggregator_idx
  ON public.orders (buyer_aggregator_id, created_at DESC) WHERE buyer_aggregator_id IS NOT NULL;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS bulk_fee_percent numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_bulk_fee_check;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_bulk_fee_check
  CHECK (bulk_fee_percent >= 0 AND bulk_fee_percent <= 100);
