-- ================================================================
-- YFF — Rider approval by moderator
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Background: /api/rider/register used to insert riders straight to
-- 'active', bypassing the pending_approval → active lifecycle the
-- delivery_boys table was designed for. Anyone who filled in the public
-- signup form became a live rider and could accept a real order — which
-- hands them a buyer's name, phone and home address. Registration now
-- inserts 'pending_approval'; a moderator vets the application (including
-- the uploaded ID photo) and approves it.
-- ================================================================

-- The moderator who approved this rider, and the zone they approved them
-- into. Riders declare pincodes at signup but have no zone of their own, so
-- the zone is stamped at approval time from the approving moderator's
-- session. Pending riders have zone NULL — they are unclaimed, so every
-- moderator can see and vet them.
ALTER TABLE delivery_boys ADD COLUMN IF NOT EXISTS zone             varchar(60);
ALTER TABLE delivery_boys ADD COLUMN IF NOT EXISTS approved_by      text;

-- Rejection is terminal and keeps the row, so the same phone can't silently
-- re-apply and so there's a record of who was turned away and why.
ALTER TABLE delivery_boys ADD COLUMN IF NOT EXISTS rejected_at      timestamptz;
ALTER TABLE delivery_boys ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN delivery_boys.zone IS
  'Zone the approving moderator manages. NULL while pending_approval.';
COMMENT ON COLUMN delivery_boys.status IS
  'pending_approval | active | suspended | rejected';

-- Moderators list by status, and scope active riders to their own zone.
CREATE INDEX IF NOT EXISTS idx_delivery_boys_zone_status
  ON delivery_boys (zone, status);

-- Riders already live before this change keep working. Their zone stays NULL,
-- and the moderator list deliberately includes NULL-zone actives so they stay
-- visible (and can be re-scoped) rather than vanishing from every zone.
