-- ================================================================
-- YFF — Pickup handover confirmation
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Self-pickup orders now get the same 4-digit handover code that home
-- delivery already uses (orders.handover_otp). The customer reads the code
-- to the FARMER when collecting; the farmer types it into their dashboard
-- to confirm the right person took the goods. A match stamps collected_at.
-- ================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_at timestamptz;

COMMENT ON COLUMN orders.collected_at IS
  'When a self-pickup order was confirmed collected by the farmer (handover code matched).';
