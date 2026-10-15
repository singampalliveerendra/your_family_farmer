-- ================================================================
-- YFF Orders: farmer / aggregator can mark an order Resolved
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================
--
-- When the buyer can't be reached to read their handover code, the farmer can
-- now close an approved order themselves (/api/farmer/orders/[id]/resolve).
-- That stamps the usual closing column (collected_at / received_at) AND this
-- one, so the buyer's order page says "Marked completed by the farmer" rather
-- than "confirmed with your code". An order_events row records the farmer and
-- their note.
--
-- Until this runs, the Resolve button answers "not switched on yet" and
-- changes nothing; every order screen keeps working as before.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS farmer_resolved_at timestamptz;

-- Check:
-- select column_name, data_type from information_schema.columns
--  where table_name = 'orders' and column_name = 'farmer_resolved_at';
