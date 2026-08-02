-- ================================================================
-- YFF — Farmer social channels
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Many farmers already run a Facebook page, an Instagram account or a YouTube
-- channel about their farm, and that existing audience is the strongest trust
-- signal we have — far stronger than anything we can generate ourselves for a
-- new seller. There was nowhere to put those links, so buyers landing on a
-- profile had no way to check the farmer out beyond what we show.
--
-- Three plain text columns rather than a JSON blob or a separate table: the set
-- is fixed, small, and every surface reads all three together.
--
-- Links are normalised (scheme added, non-http rejected) before they are saved
-- and again before they are rendered — see src/lib/links.ts.
-- ================================================================

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS facebook_url  text;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS youtube_url   text;

COMMENT ON COLUMN farmers.facebook_url  IS 'Optional public Facebook page for this farm. Shown on the farmer profile.';
COMMENT ON COLUMN farmers.instagram_url IS 'Optional public Instagram profile for this farm. Shown on the farmer profile.';
COMMENT ON COLUMN farmers.youtube_url   IS 'Optional public YouTube channel for this farm. Shown on the farmer profile.';
