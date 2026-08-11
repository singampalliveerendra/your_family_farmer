-- ================================================================
-- YFF — Aggregators
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- An aggregator collects produce from several farmers and sells it here. The
-- whole feature is one constraint: the originating farmer's identity must
-- survive the aggregation.
--
-- An aggregator is a `farmers` row with account_type = 'aggregator', NOT a new
-- table. farmer_id is load-bearing across ~9 tables and ~62 source files —
-- orders, harvests, reviews, follows, platform fee, delivery charge, rider job
-- grouping, refund-by-remaining-farmer-count. A parallel table would fork every
-- one of those paths. An aggregator behaves identically to a farmer
-- commercially; only the consumer-facing presentation differs, which is the
-- only place account_type is read.
-- ================================================================


-- ---------------------------------------------------------------
-- 1. Aggregator fields on farmers
-- ---------------------------------------------------------------
-- account_type carries a DEFAULT so every existing row stays valid and none of
-- the ~62 files that read farmers change behaviour. The CHECK stops a typo
-- silently creating a third kind of seller that no consumer surface handles.

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'farmer';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farmers_account_type_check') THEN
    ALTER TABLE farmers ADD CONSTRAINT farmers_account_type_check
      CHECK (account_type IN ('farmer', 'aggregator'));
  END IF;
END $$;

-- Registration fields the spec asks for that `farmers` does not already cover.
-- Organisation name → name, Village/District → village/district, WhatsApp →
-- phone, Operating Since → farming_since_year, Location → lat/lng/location_name,
-- photos → cover_photo_url/photo_url, Pickup locations → pickup_locations.
--
-- organic_certificate_url is deliberately NOT pesticide_cert_url: that column is
-- a pesticide-free declaration, which is a different claim from a certification.
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS contact_person          text;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS how_we_aggregate        text;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS business_cert_url       text;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS organic_certificate_url text;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS terms_accepted_at       timestamptz;

COMMENT ON COLUMN farmers.account_type IS
  'farmer (default, grows their own produce) or aggregator (resells other farmers'' produce, must name the source farmer on every harvest).';
COMMENT ON COLUMN farmers.contact_person IS
  'Name of the person behind the organisation. Aggregators only.';
COMMENT ON COLUMN farmers.how_we_aggregate IS
  'Free text: how this aggregator sources and handles produce. Buyer-facing.';
COMMENT ON COLUMN farmers.business_cert_url IS
  'Certificate of Business. Aggregators only.';
COMMENT ON COLUMN farmers.organic_certificate_url IS
  'Certificate of Organic produce. Distinct from pesticide_cert_url, which is a pesticide-free declaration rather than a certification.';
COMMENT ON COLUMN farmers.terms_accepted_at IS
  'When the aggregator agreed to the transparency terms at registration. The T&C is the product''s trust claim, so this timestamp is the record that they agreed.';

-- Approval: NOT required. Aggregators sign up and sell immediately, same as
-- farmers (decided 2026-08-11).
--
-- The column is kept, defaulting to 'approved', so vetting can be switched on
-- later without a migration against a live farmers table. Nothing reads or
-- writes it today.
--
-- Recorded for whoever turns it on: `active` CANNOT carry approval.
-- api/auth/login/route.ts unconditionally runs `update({ active: true })` on
-- every successful login, so a pending seller would approve themselves just by
-- logging in, and api/auth/me/route.ts clears the session when active is false,
-- which locks them out of their own profile. `active` means "this account is
-- real", not "this account may sell".
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farmers_approval_status_check') THEN
    ALTER TABLE farmers ADD CONSTRAINT farmers_approval_status_check
      CHECK (approval_status IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN farmers.approval_status IS
  'Reserved. Every seller is approved on signup today; the column exists so vetting can be enabled later without a migration. Distinct from `active`, which login sets to true on every successful sign-in and therefore cannot gate selling.';


-- ---------------------------------------------------------------
-- 2. The source-farmer registry
-- ---------------------------------------------------------------
-- The farmers an aggregator works with are NOT accounts: no slug, no password,
-- no dashboard, no login. They are contact records owned by the aggregator.

CREATE TABLE IF NOT EXISTS source_farmers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_id uuid NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  name          text NOT NULL,
  address       text,
  -- [ADDED — not in the spec, strip if unwanted] `address` is free text and can
  -- be a full postal line, which overflows a 390px card. The consumer card
  -- title reads "Tomatoes — from Ramesh, Kovvur", so it needs a short place
  -- name. Storing it beats parsing an address later.
  village       text,
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Re-runnable: pick up `village` on an environment that already has the table.
ALTER TABLE source_farmers ADD COLUMN IF NOT EXISTS village text;

COMMENT ON TABLE source_farmers IS
  'Farmers an aggregator sources from. Contact records, not accounts — owned by and scoped to a single aggregator.';

CREATE INDEX IF NOT EXISTS source_farmers_aggregator_idx
  ON source_farmers (aggregator_id, name);

-- RLS is enabled with a read-only policy. Without RLS, Supabase's default grants
-- would let anon INSERT/UPDATE/DELETE this table outright. Writes go through the
-- session-gated API routes on the service-role key; there is no anon write
-- policy by design.
--
-- PRIVACY NOTE: public SELECT publishes each source farmer's name, address and
-- phone. That is what the spec requires — the buyer must be able to see who grew
-- the produce — but these are third parties who never signed up themselves.
-- Worth confirming the aggregator has their consent at registration.
ALTER TABLE source_farmers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_farmers public read" ON source_farmers;
CREATE POLICY "source_farmers public read"
  ON source_farmers FOR SELECT TO public USING (true);


-- ---------------------------------------------------------------
-- 3. Link each harvest to the farmer it actually came from
-- ---------------------------------------------------------------
-- On harvests, NOT produce_listings. A harvest is one physical pick from one
-- farm, harvests already carries its own farmer_id, and the consumer browses
-- card-per-harvest. On the listing it would force an aggregator to duplicate the
-- entire listing for every farmer they buy the same crop from.
--
-- ON DELETE RESTRICT so a source farmer with harvests on record cannot be
-- erased — the attribution has to survive.

ALTER TABLE harvests ADD COLUMN IF NOT EXISTS source_farmer_id uuid
  REFERENCES source_farmers(id) ON DELETE RESTRICT;

COMMENT ON COLUMN harvests.source_farmer_id IS
  'Which of the aggregator''s source farmers this pick came from. Required when the seller is an aggregator; always NULL for a farmer selling their own produce.';

CREATE INDEX IF NOT EXISTS harvests_source_farmer_idx
  ON harvests (source_farmer_id) WHERE source_farmer_id IS NOT NULL;

-- "An aggregator should not combine harvests of various farmers though of the
-- same type." One harvest names exactly ONE source farmer, so a combined pick is
-- not representable. That rule needs no extra constraint — it is the shape of
-- the column.
--
-- [ADDED — not in the spec, strip if unwanted]
-- What the FK alone does NOT enforce is that an aggregator never leaves it
-- empty: the column is nullable. A server-side check on the farmer harvest route
-- leaves a hole, because HarvestManager is shared with the moderator surface —
-- the moderator path could create an aggregator harvest with no source farmer.
-- This trigger closes every path at once, including SQL run by hand.
CREATE OR REPLACE FUNCTION enforce_harvest_source_farmer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id   uuid;
  owner_type text;
  src_owner  uuid;
BEGIN
  -- harvests.farmer_id is nullable; fall back to the listing's owner.
  owner_id := COALESCE(
    NEW.farmer_id,
    (SELECT farmer_id FROM produce_listings WHERE id = NEW.produce_listing_id)
  );

  SELECT account_type INTO owner_type FROM farmers WHERE id = owner_id;

  IF owner_type = 'aggregator' THEN
    IF NEW.source_farmer_id IS NULL THEN
      RAISE EXCEPTION 'An aggregator harvest must name the farmer it came from.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- An aggregator must not be able to attribute a pick to another
    -- aggregator's source farmer.
    SELECT aggregator_id INTO src_owner FROM source_farmers WHERE id = NEW.source_farmer_id;
    IF src_owner IS DISTINCT FROM owner_id THEN
      RAISE EXCEPTION 'That farmer is not in this aggregator''s list.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- A farmer selling their own produce has no source farmer, ever.
    NEW.source_farmer_id := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS harvests_source_farmer_trigger ON harvests;
CREATE TRIGGER harvests_source_farmer_trigger
  BEFORE INSERT OR UPDATE ON harvests
  FOR EACH ROW EXECUTE FUNCTION enforce_harvest_source_farmer();


-- ---------------------------------------------------------------
-- 4. Payout account details — farmers AND aggregators
-- ---------------------------------------------------------------
-- Deliberately NOT on `farmers`. That table is world-readable
-- ("Public read farmers" FOR SELECT TO public USING (true)) with no column
-- grants, and RLS is row-level only — it cannot hide columns. Anything stored
-- there is readable by anyone holding the public anon key. Worse, the blanket
-- anon UPDATE policy on farmers would let a stranger rewrite an account number
-- and redirect a payout.
--
-- RLS is enabled here with NO policy at all. That is intentional, not an
-- oversight: anon and authenticated get nothing under any circumstance. Only the
-- service-role key, which bypasses RLS and never leaves the server, can touch
-- it — via the session-gated /api/farmer/payout-details route.
--
-- Payout is manual: we receive payment, calculate shares and transfer by hand.
-- Nothing here touches the order or payment flow.

CREATE TABLE IF NOT EXISTS payout_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL UNIQUE REFERENCES farmers(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  account_number      text NOT NULL,
  ifsc                text NOT NULL,
  upi_id              text,
  verified_at         timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payout_accounts IS
  'Bank/UPI payout details for farmers and aggregators. Service-role only — RLS enabled with no policy, so anon and authenticated have no access. Never select this from a client component.';
COMMENT ON COLUMN payout_accounts.account_holder_name IS
  'Required. A transfer cannot be made without it, and farmers.bank_account_number never captured it.';

ALTER TABLE payout_accounts ENABLE ROW LEVEL SECURITY;

-- Backfill what farmers already holds. Those columns were write-only — nothing
-- in the app ever read them — so the account holder name was never collected and
-- falls back to the farm name for a human to correct later.
-- The old columns stay in place; drop them once launch is verified.
INSERT INTO payout_accounts (owner_id, account_holder_name, account_number, ifsc)
SELECT id, name, btrim(bank_account_number), btrim(upper(bank_ifsc))
FROM farmers
WHERE bank_account_number IS NOT NULL
  AND bank_ifsc IS NOT NULL
  AND btrim(bank_account_number) <> ''
  AND btrim(bank_ifsc) <> ''
ON CONFLICT (owner_id) DO NOTHING;
