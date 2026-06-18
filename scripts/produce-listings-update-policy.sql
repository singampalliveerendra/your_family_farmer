-- ============================================================
-- RLS: allow updates on produce_listings
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================
-- The farmer dashboard needs to update a farmer's own produce — most
-- visibly the Pause and Suspend buttons (status changes), but also
-- inline edits. There was no UPDATE policy, so the anon client's
-- .update() matched 0 rows and silently persisted nothing.
-- Matches the public-write model used elsewhere in the MVP (anon
-- INSERT and DELETE are already allowed). Tighten with auth.uid()
-- once farmer auth is wired up.

DROP POLICY IF EXISTS "produce_listings public update" ON produce_listings;
CREATE POLICY "produce_listings public update"
  ON produce_listings FOR UPDATE
  USING (true)
  WITH CHECK (true);
