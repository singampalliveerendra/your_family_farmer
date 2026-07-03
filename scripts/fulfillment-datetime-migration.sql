-- ================================================================
-- YFF — Pickup/Delivery schedule: date → date + time
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- The farmer's pickup/delivery schedule used to be a date only. It now carries
-- a time too (the farmer picks date + time), so the column becomes a
-- timestamptz. Existing date-only values become that day's midnight timestamp.
-- ================================================================

ALTER TABLE orders
  ALTER COLUMN fulfillment_date TYPE timestamptz
  USING fulfillment_date::timestamptz;
