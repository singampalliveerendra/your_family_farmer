-- ================================================================
-- YFF — Moderator dashboard features 3, 7, 9
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Covers:
--   Feature 3 (Listing management) — moderator approves/rejects listings
--   Feature 7 (Escalation management) — complaints & disputes
--   (Feature 9 Reports is read-only over existing tables — no DDL.)
-- ================================================================

-- Feature 3 — reject a listing with a reason. The listing flow reuses the
-- existing produce_listings.status varchar with values:
--   pending_review → available (approve) | rejected (reject)
--   available → sold_out (suspend)
ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Feature 7 — escalations. Service-role only, like order_events: RLS is ON with
-- no policies, so the anon key cannot read or write it. All access goes through
-- /api/moderator/* which verifies the moderator cookie and scopes by region_slug.
CREATE TABLE IF NOT EXISTS escalations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid REFERENCES orders(id) ON DELETE SET NULL,
  region_slug      varchar(60),
  -- delivery_delay | quality_complaint | payment_issue | other
  type             text NOT NULL DEFAULT 'other',
  description      text,
  -- free text: who raised it, e.g. "Consumer: Ravi Sharma" or "system"
  raised_by        text,
  -- open | in_progress | resolved
  status           text NOT NULL DEFAULT 'open',
  resolution_notes text,
  resolved_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escalations_zone_status_idx ON escalations (region_slug, status);
CREATE INDEX IF NOT EXISTS escalations_created_idx ON escalations (created_at DESC);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
