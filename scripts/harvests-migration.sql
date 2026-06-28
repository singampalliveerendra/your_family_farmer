-- ================================================================
-- YFF — Harvests model (USP: "farmer adds a Harvest, not a produce")
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- A produce_listing is now a TEMPLATE (Tomatoes, Natural, price tiers, photos).
-- A farmer logs a fresh HARVEST against that template whenever they pick —
-- carrying the harvest date+time, shelf life, and approximate quantity. The
-- consumer "Today's Harvest near you" feed and the "Harvested 2 hours ago"
-- clock both read from this table.
--
-- One produce (template)  ──<  many harvests.
-- ================================================================

CREATE TABLE IF NOT EXISTS harvests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produce_listing_id uuid NOT NULL REFERENCES produce_listings(id) ON DELETE CASCADE,
  farmer_id          uuid,                       -- denormalised for fast farmer/feed queries
  harvested_at       timestamptz NOT NULL,       -- date + time of harvest → powers the clock
  shelf_life_days    int,                        -- how many days it stays fresh
  approx_quantity    numeric,                    -- approximate quantity harvested
  unit               text,                       -- kg / dozen / bunch (mirrors the listing's unit)
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Latest harvest for a given produce (template) first.
CREATE INDEX IF NOT EXISTS idx_harvests_listing
  ON harvests(produce_listing_id, harvested_at DESC);

-- A farmer's own harvest history.
CREATE INDEX IF NOT EXISTS idx_harvests_farmer
  ON harvests(farmer_id, harvested_at DESC);

-- The consumer "Today's Harvest near you" feed scans recent harvests globally.
CREATE INDEX IF NOT EXISTS idx_harvests_recent
  ON harvests(harvested_at DESC);

-- RLS: matches the MVP public-read / public-write model used by produce_listings.
-- The farmer dashboard writes via the anon client (localStorage auth, no cookie
-- API route), and the consumer feed reads publicly. Tighten with auth.uid()
-- once farmer auth is wired up.
ALTER TABLE harvests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "harvests public read" ON harvests;
CREATE POLICY "harvests public read"   ON harvests FOR SELECT USING (true);

DROP POLICY IF EXISTS "harvests public insert" ON harvests;
CREATE POLICY "harvests public insert" ON harvests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "harvests public update" ON harvests;
CREATE POLICY "harvests public update" ON harvests FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "harvests public delete" ON harvests;
CREATE POLICY "harvests public delete" ON harvests FOR DELETE USING (true);
