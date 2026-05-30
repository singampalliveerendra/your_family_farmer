-- ================================================================
-- YFF — Moderator dashboard feature 8 (Price management)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Suggested price ranges per crop, per zone. Shown as a hint on the
-- farmer listing form ("Suggested: ₹40–₹60/kg") — guidance only, never
-- enforced. One row per (crop_name, region_slug).
-- ================================================================

-- Service-role only, like escalations / moderators: RLS is ON with no
-- policies, so the anon key cannot read or write it. The moderator UI writes
-- through /api/moderator/prices, and the farmer form reads the hint through
-- /api/prices — both server routes use the service-role key.
CREATE TABLE IF NOT EXISTS price_guidelines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_name    varchar(100) NOT NULL,
  region_slug  varchar(60) NOT NULL,
  min_price    numeric(8,2),
  max_price    numeric(8,2),
  unit         varchar(20) DEFAULT 'kg',
  -- nullable: the current single-password moderator login has no per-user id.
  -- Kept for forward-compat once per-person moderator accounts are live.
  updated_by   uuid REFERENCES moderators(id) ON DELETE SET NULL,
  updated_at   timestamptz DEFAULT now()
);

-- One guideline per crop per zone. The moderator UI relies on this to upsert.
CREATE UNIQUE INDEX IF NOT EXISTS price_guidelines_crop_zone_idx
  ON price_guidelines (region_slug, lower(crop_name));

ALTER TABLE price_guidelines ENABLE ROW LEVEL SECURITY;
