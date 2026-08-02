-- ================================================================
-- YFF — Video link on a produce listing
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Farmers had no way to attach a video to a produce. The `media` table holds
-- farm-level videos (shown in the profile's Farm Videos tab), but nothing tied
-- a clip to the crop a buyer is actually looking at — "here is this week's
-- tomato patch" belongs on the tomato listing, not in a general gallery.
--
-- A single link (YouTube / Instagram / any URL the farmer already has), not an
-- upload: these are 4G phone users and video hosting is not our problem to
-- solve. The consumer produce page renders it as a "Watch video" link.
-- ================================================================

ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN produce_listings.video_url IS
  'Optional farmer-supplied video link for this produce (YouTube/Instagram/etc). Shown to buyers on the produce and harvest pages.';
