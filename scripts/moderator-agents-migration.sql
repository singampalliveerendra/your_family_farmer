-- ================================================================
-- YFF — Moderator dashboard feature 6 (Delivery agent management)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Local delivery agents the moderator onboards for their zone. This is a
-- standalone roster, separate from the rider self-signup `delivery_boys`
-- table — it is not (yet) wired into order assignment, so it has no link to
-- orders. Aadhaar is stored only as a one-way hash; the plain number is never
-- persisted.
-- ================================================================

-- Service-role only, like delivery_boys / escalations: RLS on, no policies.
-- All access goes through /api/moderator/agents which verifies the moderator
-- cookie and scopes by zone.
CREATE TABLE IF NOT EXISTS delivery_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(100) NOT NULL,
  phone         varchar(15) NOT NULL,
  -- sha256 of the 12-digit Aadhaar (hex). One-way: used only to dedupe and to
  -- prove an ID was recorded. Never reversible, never displayed.
  aadhaar_hash  text,
  vehicle_type  text,
  delivery_area text,
  availability  text[],
  zone          varchar(60),
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- A phone uniquely identifies an agent within a zone.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_agents_zone_phone_idx
  ON delivery_agents (zone, phone);
CREATE INDEX IF NOT EXISTS delivery_agents_zone_active_idx
  ON delivery_agents (zone, active);

ALTER TABLE delivery_agents ENABLE ROW LEVEL SECURITY;
