-- ================================================================
-- YFF — Move the aggregator's farmer selection from harvest to produce
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Client request (Trello): "Move the farmer selection from harvest to produce
-- in the aggregator."
--
-- 20260811_aggregator.sql deliberately put source_farmer_id on `harvests`, so
-- one listing could carry picks from several farmers. In practice an aggregator
-- lists "Ramesh's tomatoes" as its own produce and then logs pick after pick
-- against it, re-answering the same question every time. The attribution is now
-- chosen ONCE on the produce and every harvest under it inherits that farmer.
--
-- harvests.source_farmer_id is NOT dropped. It stays as the stored attribution
-- of each individual pick, because:
--   * every consumer surface reads it (the harvest card and the harvest detail
--     page embed source_farmers through it) — nothing there changes;
--   * a pick keeps the farmer it was actually credited to at the time, so
--     re-pointing a listing at a different farmer later cannot silently rewrite
--     the history of what buyers already bought.
-- It simply stops being something a human types in: it is inherited from the
-- listing on insert.
-- ================================================================


-- ---------------------------------------------------------------
-- 1. The attribution column on produce_listings
-- ---------------------------------------------------------------
-- ON DELETE RESTRICT, matching harvests: a source farmer who is named on a
-- live listing cannot be erased out from under it.

ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS source_farmer_id uuid
  REFERENCES source_farmers(id) ON DELETE RESTRICT;

COMMENT ON COLUMN produce_listings.source_farmer_id IS
  'Which of the aggregator''s source farmers grows this produce. Required when the seller is an aggregator; always NULL for a farmer selling their own. Every harvest logged against the listing inherits it.';

CREATE INDEX IF NOT EXISTS produce_listings_source_farmer_idx
  ON produce_listings (source_farmer_id) WHERE source_farmer_id IS NOT NULL;


-- ---------------------------------------------------------------
-- 2. Backfill from the harvests already logged
-- ---------------------------------------------------------------
-- An existing aggregator listing has its answer in its own harvests. Where a
-- listing's picks disagree (allowed under the old model), the most-used farmer
-- wins, ties broken by the most recent pick — the closest thing to "who this
-- listing is really about". Nothing is invented: a listing with no attributed
-- harvest stays NULL and the aggregator is asked on their next edit.

WITH ranked AS (
  SELECT
    h.produce_listing_id,
    h.source_farmer_id,
    ROW_NUMBER() OVER (
      PARTITION BY h.produce_listing_id
      ORDER BY COUNT(*) DESC, MAX(h.harvested_at) DESC
    ) AS rn
  FROM harvests h
  WHERE h.source_farmer_id IS NOT NULL
  GROUP BY h.produce_listing_id, h.source_farmer_id
)
UPDATE produce_listings p
SET source_farmer_id = ranked.source_farmer_id
FROM ranked
WHERE ranked.rn = 1
  AND ranked.produce_listing_id = p.id
  AND p.source_farmer_id IS NULL;


-- ---------------------------------------------------------------
-- 3. Enforce the attribution on the listing
-- ---------------------------------------------------------------
-- Same shape as the harvest trigger it takes over from: an aggregator must name
-- a farmer, that farmer must be one of theirs, and a plain farmer never has one.
--
-- On UPDATE the requirement only fires when the column itself changes. Partial
-- updates are routine here (the dashboard writes a separate best-effort
-- "quality patch", moderators flip status), and those must not start failing on
-- a legacy listing that predates this column and has no harvest to backfill
-- from. Clearing a set attribution is still refused, and the harvest trigger
-- below is the guarantee that nothing reaches a buyer unattributed.
CREATE OR REPLACE FUNCTION enforce_listing_source_farmer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_type text;
  src_owner  uuid;
BEGIN
  SELECT account_type INTO owner_type FROM farmers WHERE id = NEW.farmer_id;

  IF owner_type = 'aggregator' THEN
    IF NEW.source_farmer_id IS NULL THEN
      IF TG_OP = 'INSERT' OR OLD.source_farmer_id IS NOT NULL THEN
        RAISE EXCEPTION 'An aggregator''s produce must name the farmer who grows it.'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;  -- legacy row, untouched by this update
    END IF;

    SELECT aggregator_id INTO src_owner FROM source_farmers WHERE id = NEW.source_farmer_id;
    IF src_owner IS DISTINCT FROM NEW.farmer_id THEN
      RAISE EXCEPTION 'That farmer is not in this aggregator''s list.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.source_farmer_id := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS produce_listings_source_farmer_trigger ON produce_listings;
CREATE TRIGGER produce_listings_source_farmer_trigger
  BEFORE INSERT OR UPDATE ON produce_listings
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_source_farmer();


-- ---------------------------------------------------------------
-- 4. Harvests inherit instead of asking
-- ---------------------------------------------------------------
-- Replaces the 20260811 version. The rule it enforced is unchanged — an
-- aggregator harvest always names one of that aggregator's farmers — but an
-- insert that omits the column now inherits the listing's farmer rather than
-- being rejected. That is what lets the picker disappear from the harvest form,
-- and it fixes the moderator "add listing" route, whose seed-harvest insert
-- never sent a source farmer and therefore could not create an aggregator's
-- first harvest at all.
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
    -- Inherit the produce's farmer when the caller didn't name one.
    IF NEW.source_farmer_id IS NULL THEN
      SELECT source_farmer_id INTO NEW.source_farmer_id
      FROM produce_listings WHERE id = NEW.produce_listing_id;
    END IF;

    IF NEW.source_farmer_id IS NULL THEN
      RAISE EXCEPTION 'This produce does not name the farmer it comes from. Set it on the produce first.'
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

-- Trigger definition is unchanged; recreated so a re-run is self-contained.
DROP TRIGGER IF EXISTS harvests_source_farmer_trigger ON harvests;
CREATE TRIGGER harvests_source_farmer_trigger
  BEFORE INSERT OR UPDATE ON harvests
  FOR EACH ROW EXECUTE FUNCTION enforce_harvest_source_farmer();


-- ---------------------------------------------------------------
-- 5. RLS: let an aggregator set the column from the dashboard
-- ---------------------------------------------------------------
-- No policy change is needed. produce_listings already carries the app's
-- anon INSERT/UPDATE policies (the farmer dashboard writes listings with the
-- public key), and the trigger above — which runs regardless of who is writing
-- — is what stops a bad value, exactly as the harvest trigger always has.
