-- ================================================================
-- YFF — Farmer COD toggle
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

-- Per-farmer flag: when true, buyers can choose Cash on Delivery in checkout.
-- Default OFF — farmer must explicitly opt in from dashboard settings.
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS cod_enabled boolean DEFAULT false;

-- Backfill existing rows so NULL doesn't leak through to clients
UPDATE farmers SET cod_enabled = false WHERE cod_enabled IS NULL;
