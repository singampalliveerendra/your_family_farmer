-- ================================================================
-- YFF Wholesale: sell a produce as Retail, Wholesale or Both
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run twice (IF NOT EXISTS / DROP ... IF EXISTS).
-- STATUS: applied to STAGING 2026-11-03 (migrations `wholesale` +
-- `wholesale_fields_check_null_fix`). NOT applied to prod.
-- ================================================================
--
-- produce_listings
--   sale_mode                  'retail' (default) | 'wholesale' | 'both'
--   wholesale_price            price per listing unit (₹/kg etc.) for wholesale
--   wholesale_min_qty          least a wholesale buyer can order, in the listing unit
--   wholesale_pack_size        optional: wholesale orders go in multiples of this
--                              (e.g. 25 = 25 kg bags). NULL = any qty ≥ min.
--   wholesale_transport_states where the farmer can deliver wholesale:
--                              {} = buyer collects, {AP}, {TG} or {AP,TG}
--
-- orders
--   order_type                 'retail' (default) | 'wholesale'
--
-- Quantities are numeric(10,3), the same as produce_listings.stock_qty
-- (scripts/sale-step-migration.sql), so a 0.25 kg pack fits.
--
-- Stock is NOT duplicated. Retail and wholesale both draw from the same
-- harvests.stock_qty through decrement_harvest_stock(), so there is no new
-- stock column on purpose.
--
-- Every existing listing becomes 'retail' and every existing order 'retail',
-- so nothing changes for current users until a farmer picks Wholesale/Both.
-- Wholesale values are kept if a farmer switches back to Retail, so switching
-- again does not lose them.

-- ---- produce_listings -------------------------------------------------------

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS sale_mode text NOT NULL DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS wholesale_price numeric(8,2),
  ADD COLUMN IF NOT EXISTS wholesale_min_qty numeric(10,3),
  ADD COLUMN IF NOT EXISTS wholesale_pack_size numeric(10,3),
  ADD COLUMN IF NOT EXISTS wholesale_transport_states text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_sale_mode_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_sale_mode_check
  CHECK (sale_mode IN ('retail', 'wholesale', 'both'));

-- A listing offered wholesale must have a wholesale price and minimum.
-- COALESCE matters: a CHECK passes when it evaluates to NULL, so a bare
-- `wholesale_price > 0` let a missing price through (caught on staging
-- 2026-11-03, fixed there by migration wholesale_fields_check_null_fix).
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_fields_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_fields_check
  CHECK (
    sale_mode = 'retail'
    OR (COALESCE(wholesale_price, 0) > 0 AND COALESCE(wholesale_min_qty, 0) > 0)
  );

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_pack_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_pack_check
  CHECK (wholesale_pack_size IS NULL OR wholesale_pack_size > 0);

-- Only Andhra Pradesh and Telangana for now.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_transport_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_transport_check
  CHECK (wholesale_transport_states <@ ARRAY['AP', 'TG']::text[]);

-- Wholesale browse reads only the non-retail listings.
CREATE INDEX IF NOT EXISTS idx_produce_listings_wholesale
  ON public.produce_listings (sale_mode)
  WHERE sale_mode <> 'retail';

-- ---- orders -----------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'retail';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('retail', 'wholesale'));

-- No grant on orders.order_type: the browser has no access to `orders` at all
-- (scripts/anon-lockdown-orders-reviews.sql). The order routes set it with the
-- service role.

-- Make PostgREST see the new columns straight away.
NOTIFY pgrst, 'reload schema';
