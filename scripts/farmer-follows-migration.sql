-- ================================================================
-- YFF — Farmer follows (real, counted "Follow" relationship)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Replaces the old localStorage-only Follow toggle. One row per
-- (consumer, farmer). Follower COUNT powers:
--   • the number shown on the farmer profile + farmer cards
--   • ranking farmers by popularity in the region farmers list
--
-- Writes go through the service-role API (/api/farmer/[id]/follow),
-- which authorises the consumer via their session cookie — so we
-- only need public READ here (counts are shown to everyone).
-- ================================================================

CREATE TABLE IF NOT EXISTS farmer_follows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id   uuid NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  consumer_id uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farmer_id, consumer_id)        -- a consumer follows a farmer at most once
);

-- Count a farmer's followers fast.
CREATE INDEX IF NOT EXISTS idx_farmer_follows_farmer   ON farmer_follows(farmer_id);
-- List a consumer's follows fast (and check "am I following?").
CREATE INDEX IF NOT EXISTS idx_farmer_follows_consumer ON farmer_follows(consumer_id);

ALTER TABLE farmer_follows ENABLE ROW LEVEL SECURITY;

-- Public read: follower counts are public on profiles + cards.
DROP POLICY IF EXISTS "farmer_follows public read" ON farmer_follows;
CREATE POLICY "farmer_follows public read" ON farmer_follows FOR SELECT USING (true);

-- No public insert/delete: the follow/unfollow API uses the service-role
-- key (which bypasses RLS) after verifying the consumer's session.
