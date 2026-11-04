-- ================================================================
-- YFF Selling lock: an aggregator needs a Selling plan to put produce on sale
-- (Phase 7). Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Needs scripts/subscription-migration.sql first.
-- Safe to run twice (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
-- STATUS: applied to STAGING 2026-11-04 (migration `selling_lock`; 12 cases probed incl.
-- the anon role, all rolled back; functions not callable from the browser). NOT on prod.
-- ================================================================
--
-- Decision 2026-11-04: both Buying and Selling need a plan; the client's
-- existing aggregators are free forever (they got a free_forever Combined row
-- in subscription-migration.sql), so this only bites aggregators who sign up
-- after plans launched — and farmers never (they are free, always).
--
-- Enforced HERE, in the database, because the farmer/aggregator dashboard
-- writes produce_listings straight from the browser. A rule in the app alone
-- would be one devtools call away from being skipped.
--
-- What it blocks: an aggregator's produce ENTERING sale — a new listing, or a
-- paused / hidden one switched back to available / coming_soon / sold_out —
-- without a live Selling or Combined plan.
-- What it never blocks: anything already on sale. Stock going down with an
-- order, the sold-out flip, price edits — all unchanged. That is also what
-- keeps listings up through the 10 days after a plan ends (2026-11-04): they
-- are never touched by this; only a moderator's "Hide listings" takes them
-- down.
--
-- aggregator_can_sell() is SECURITY DEFINER (it reads the server-only
-- aggregator_subscriptions table) and not callable by anon / authenticated.
-- ================================================================

CREATE OR REPLACE FUNCTION public.aggregator_can_sell(p_farmer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aggregator_subscriptions s
    WHERE s.aggregator_id = p_farmer
      AND s.status = 'active'
      AND s.kind IN ('selling', 'combined')
      AND s.starts_at <= now()
      AND (s.ends_at IS NULL OR s.ends_at > now())
  )
$$;
REVOKE ALL ON FUNCTION public.aggregator_can_sell(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_aggregator_selling_plan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Not going on sale: drafts, paused, suspended, rejected… always allowed.
  IF NEW.status IS NULL OR NEW.status NOT IN ('available', 'coming_soon', 'sold_out') THEN
    RETURN NEW;
  END IF;
  -- Already on sale before this change: stock / price / sold-out edits.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('available', 'coming_soon', 'sold_out') THEN
    RETURN NEW;
  END IF;
  -- Farmers are free, always.
  IF NOT EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = NEW.farmer_id AND f.account_type = 'aggregator') THEN
    RETURN NEW;
  END IF;
  IF public.aggregator_can_sell(NEW.farmer_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'SELLING_PLAN_REQUIRED: a Selling plan is needed to put produce on sale.'
    USING ERRCODE = 'P0001';
END
$$;
REVOKE ALL ON FUNCTION public.enforce_aggregator_selling_plan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS produce_listings_selling_plan ON public.produce_listings;
CREATE TRIGGER produce_listings_selling_plan
  BEFORE INSERT OR UPDATE OF status ON public.produce_listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_aggregator_selling_plan();
