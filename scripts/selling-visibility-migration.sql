-- ================================================================
-- YFF Selling visibility: an aggregator's produce is SHOWN to buyers only
-- while they hold a Selling (or Buying + Selling) plan.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Needs scripts/subscription-migration.sql and scripts/selling-lock-migration.sql first.
-- Safe to run twice.
-- STATUS: not applied anywhere yet.
-- ================================================================
--
-- Decision 2026-11-27 (replaces the 2026-11-04 selling lock + "listings stay
-- 10 days, moderator hides"):
--   * An aggregator may ADD produce at any time, plan or no plan.
--   * Buyers see it only while a Selling / Combined plan is live.
--   * The moment that plan ends, it disappears for buyers — no cron, no
--     moderator. Renewing brings it back as it was.
--   * Farmers are never affected.
--
-- How: farmers.selling_until = the end of the aggregator's selling cover
-- ('infinity' for free-forever, NULL for none). Kept up to date by a trigger
-- on aggregator_subscriptions; buyer-facing reads compare it with now()
-- (src/lib/sellerVisibility.ts), so expiry needs nothing to run.
-- It is readable by the anon key (the feed's browser parts need it) but
-- writable only through refresh_selling_until() — a guard trigger keeps any
-- other write from changing it.
-- ================================================================

ALTER TABLE public.farmers ADD COLUMN IF NOT EXISTS selling_until timestamptz;
GRANT SELECT (selling_until) ON public.farmers TO anon, authenticated;

-- The end of the selling cover. Rows bought "after the current plan" chain
-- straight on from it, so the latest end is the end of the cover.
CREATE OR REPLACE FUNCTION public.refresh_selling_until(p_farmer uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v timestamptz;
BEGIN
  SELECT max(COALESCE(s.ends_at, 'infinity'::timestamptz)) INTO v
  FROM public.aggregator_subscriptions s
  WHERE s.aggregator_id = p_farmer
    AND s.status = 'active'
    AND s.kind IN ('selling', 'combined');
  PERFORM set_config('yff.selling_refresh', 'on', true);
  UPDATE public.farmers SET selling_until = v
  WHERE id = p_farmer AND selling_until IS DISTINCT FROM v;
  PERFORM set_config('yff.selling_refresh', 'off', true);
END
$$;
REVOKE ALL ON FUNCTION public.refresh_selling_until(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aggregator_subscriptions_sync_selling()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.aggregator_id IS DISTINCT FROM OLD.aggregator_id) THEN
    PERFORM public.refresh_selling_until(OLD.aggregator_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.refresh_selling_until(NEW.aggregator_id); END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.aggregator_subscriptions_sync_selling() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aggregator_subscriptions_selling_until ON public.aggregator_subscriptions;
CREATE TRIGGER aggregator_subscriptions_selling_until
  AFTER INSERT OR UPDATE OR DELETE ON public.aggregator_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.aggregator_subscriptions_sync_selling();

-- Nobody else may change selling_until (a profile save, a moderator edit…).
CREATE OR REPLACE FUNCTION public.farmers_guard_selling_until()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('yff.selling_refresh', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT' THEN NEW.selling_until := NULL;
    ELSE NEW.selling_until := OLD.selling_until;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.farmers_guard_selling_until() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS farmers_selling_until_guard ON public.farmers;
CREATE TRIGGER farmers_selling_until_guard
  BEFORE INSERT OR UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.farmers_guard_selling_until();

-- Fill it for every aggregator that exists today.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.farmers WHERE account_type = 'aggregator' LOOP
    PERFORM public.refresh_selling_until(r.id);
  END LOOP;
END
$$;

-- The old selling lock is gone: adding / re-listing produce is always allowed.
DROP TRIGGER IF EXISTS produce_listings_selling_plan ON public.produce_listings;
DROP FUNCTION IF EXISTS public.enforce_aggregator_selling_plan();
