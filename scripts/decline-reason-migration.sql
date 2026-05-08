-- ================================================================
-- Decline Reason Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Adds a mandatory reason text when a farmer declines an order.
-- The reason is shown to the consumer on their order page.
-- ================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS decline_reason text;
