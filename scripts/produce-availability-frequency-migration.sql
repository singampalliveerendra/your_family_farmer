-- ================================================================
-- YFF Produce: availability date range + harvesting frequency
-- Trello card "Remove Harvest date"
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

-- 1. Availability is now a date RANGE (From → To) instead of the free-text
--    `availability_period`. The old column is left in place for back-compat but
--    is no longer written or read by the app.
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS availability_from date;
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS availability_to date;

-- 2. Harvesting frequency: a cadence ('daily' | 'weekly') plus a count, so a
--    farmer can say e.g. "weekly, 2 times" (harvested twice a week).
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS harvest_frequency text;
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS harvest_frequency_count integer;

-- Note: `harvest_date` is intentionally retained (not dropped) to avoid data
-- loss, but the "Harvest date" field has been removed from every form and view.
