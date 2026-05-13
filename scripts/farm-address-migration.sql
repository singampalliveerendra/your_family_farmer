-- ================================================================
-- YFF Farm Pickup Address Migration
-- Adds farm_address so delivery riders know where to pick up from.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS farm_address text;
