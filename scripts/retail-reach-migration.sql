-- ================================================================
-- YFF Retail produce: Local only / Transportable across AP & TG (2026-11-05)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run twice. Needs scripts/transport-bill-migration.sql? No — the
-- order side reuses orders.transport_charge / transport_state from
-- scripts/bulk-orders-migration.sql.
-- STATUS: applied to STAGING 2026-11-05 (migration `retail_reach`; 13 existing listings → local; bad values refused, rolled back). NOT on prod — run bulk-orders-migration.sql there first.
-- ================================================================
--
-- Client decision 2026-11-05: on each retail produce the farmer picks
--   local     — only buyers within their local delivery radius see it
--               (produce_listings.delivery_radius_km; 25 km when blank)
--   transport — they also send it by courier anywhere in the states they
--               pick, for a fixed charge per order per state, paid online
-- Buyers see local produce near them plus transportable produce for their
-- state. Both columns are public product information (like the price), so
-- the existing public read of produce_listings covers them; writes stay
-- server-only (scripts/seller-writes-lockdown.sql).
-- ================================================================

BEGIN;

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS retail_reach text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS retail_transport_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_reach_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_reach_check
  CHECK (retail_reach IN ('local', 'transport'));

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_rates_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_rates_check
  CHECK (jsonb_typeof(retail_transport_rates) = 'object');

COMMIT;

NOTIFY pgrst, 'reload schema';
