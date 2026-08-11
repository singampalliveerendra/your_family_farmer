-- ================================================================
-- YFF — Pause a harvest
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Until now a farmer could only DELETE a logged harvest, which is destructive
-- and wrong for the common case: the pick is real and already sold through
-- other channels, or it isn't ready to sell yet, and the farmer wants it out of
-- the consumer feed for a while without losing the record. Deleting also breaks
-- the history behind the "Harvested 2h ago" clock.
--
-- Paused harvests stay in the farmer's list (greyed, with a Resume button) and
-- disappear from every consumer surface: the browse grid, Today's Harvest,
-- Fresh/Upcoming Harvests, the harvest detail page, and order placement.
--
-- Existing rows default to NOT paused, so nothing changes until a farmer pauses
-- something. NOT NULL + default keeps the consumer filters simple: they can
-- test `paused = false` without worrying about NULLs.
-- ================================================================

ALTER TABLE harvests ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN harvests.paused IS
  'True while the farmer has this harvest hidden from buyers. Paused harvests are excluded from every consumer query and rejected at order placement, but keep their row and history.';

-- The consumer feeds all filter on this, so index the visible rows.
CREATE INDEX IF NOT EXISTS harvests_not_paused_idx
  ON harvests (produce_listing_id, harvested_at DESC)
  WHERE paused = false;
