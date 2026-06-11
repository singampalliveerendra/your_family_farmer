-- ================================================================
-- YFF — Self-service complaints (extend escalations)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Until now `escalations` only held complaints the moderator typed in on
-- someone's behalf (raised_by = free text). Consumers and farmers can now
-- raise their own complaints from their apps, so we record WHO raised it
-- in a structured way — both to auto-fill "raised by" and to give the
-- moderator a phone number to call back on.
-- ================================================================

ALTER TABLE escalations
  -- consumer | farmer | moderator  (who filed it; moderator = typed in by the team)
  ADD COLUMN IF NOT EXISTS raised_by_role  text,
  -- the consumer/farmer account id, when filed from their own app
  ADD COLUMN IF NOT EXISTS raised_by_id    uuid,
  -- callback number, copied from the raiser's profile so the moderator can reach them
  ADD COLUMN IF NOT EXISTS raised_by_phone text;

-- Look up "my complaints" quickly from the consumer/farmer apps.
CREATE INDEX IF NOT EXISTS escalations_raiser_idx
  ON escalations (raised_by_role, raised_by_id, created_at DESC);
