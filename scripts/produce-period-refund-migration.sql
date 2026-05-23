-- ================================================================
-- YFF Produce period + Order refund migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

-- 1. Availability period on produce listings (e.g. "Apr–May").
--    Was collected in the add-produce form but never persisted; this
--    column lets it be saved on add and loaded back on edit.
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS availability_period text;

-- 2. Refund status on orders. Set to 'initiated' when a farmer declines
--    an order so the buyer sees a "refund initiated" message. The actual
--    refund is processed manually for now.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_status text;
