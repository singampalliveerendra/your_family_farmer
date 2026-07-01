-- ================================================================
-- YFF — Harvest date & time + shelf life on the produce listing
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- The produce Edit form now captures the harvest date *and time* plus a
-- shelf-life (in days) directly on the listing. Previously `harvest_date`
-- was a plain `date` (no time) and there was no shelf-life column, so the
-- tester saw "harvest time and shelf life missing" on the Edit screen.
--
--   • harvest_date : date  → timestamptz   (preserve existing values @ 00:00)
--   • shelf_life_days : new int column
-- ================================================================

-- Widen harvest_date to carry a time component. The date→timestamptz cast is
-- lossless (existing dates land at local midnight); the guard makes it a no-op
-- if the column is already timestamptz.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'produce_listings'
      AND column_name = 'harvest_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE produce_listings
      ALTER COLUMN harvest_date TYPE timestamptz USING harvest_date::timestamptz;
  END IF;
END $$;

-- How many days the harvest stays fresh (optional).
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS shelf_life_days int;
