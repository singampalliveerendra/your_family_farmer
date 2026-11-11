-- ================================================================
-- YFF Transport anywhere in India (not only AP & TG)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Run AFTER scripts/wholesale-migration.sql and scripts/bulk-orders-migration.sql.
-- Safe to run twice (DROP ... IF EXISTS).
-- STATUS: see the memory notes / CHECK-prod-migrations.sql, not this line.
-- ================================================================
--
-- Client, 2026-11-11: "It is not limited to AP and TG. The aggregator or
-- farmer can transport products across all of India using the available
-- transport/cargo options."
--
--   Wholesale: "Can you transport anywhere in India?" saves the region 'IN'
--              (one way of charging for all of India). Lots saved earlier
--              with 'AP' / 'TG' keep working until edited.
--   Bulk order: transport_state may be 'IN' (delivered anywhere in India).
--   Retail cargo needs no change here: it is offered to any valid pincode
--              by the app (src/lib/retailReach.ts, /api/orders/place).

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_transport_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_transport_check
  CHECK (wholesale_transport_states <@ ARRAY['AP', 'TG', 'IN']::text[]);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_state_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_state_check
  CHECK (transport_state IS NULL OR transport_state IN ('AP', 'TG', 'IN'));
