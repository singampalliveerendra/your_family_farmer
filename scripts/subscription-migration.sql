-- ================================================================
-- YFF Aggregator subscriptions: plans + who holds which plan
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run twice (IF NOT EXISTS / DROP ... IF EXISTS / NOT EXISTS).
-- STATUS: applied to STAGING 2026-11-04 (migration `aggregator_subscriptions`;
-- 5 good + 12 bad cases probed, anon read/write checked). NOT applied to prod.
-- Run it on prod BEFORE any new aggregator signs up there, or they too would
-- get the free-forever row.
-- ================================================================
--
-- Business model agreed 2026-11-04: farmers are free; aggregators subscribe
-- to Buying (the bulk market), Selling, or a Combined plan. Moderators run it
-- all (they are the super-users for now).
--
-- subscription_plans — what moderators set up and the homepage shows
--   kind            'buying' | 'selling' | 'combined'
--   name_en/_te     plan name shown to aggregators
--   duration_days   30 = monthly, 365 = yearly, anything 1..3650 = custom
--   actual_price    original price, ₹0 allowed (= free plan, no payment)
--   offer_enabled   the offer can be switched off without losing its price
--   offer_price     discounted price; must be BELOW the actual price
--   offer_ends_at   optional; after it the actual price shows again by itself
--   offer_label_*   optional tag, e.g. "Diwali offer"
--   highlights_*    benefits, one per line, for the homepage plan card
--   active          off = hidden from the homepage and cannot be bought
--   sort_order      order on the homepage
--
-- aggregator_subscriptions — one row per plan an aggregator holds
--   kind            what it unlocks (copied from the plan at the time)
--   source          'payment' (Cashfree, Phase 4) | 'free_plan' (₹0 plan)
--                   'manual' (moderator turned it on) | 'free_forever'
--   status          'pending' (payment started) | 'active' | 'cancelled'
--   starts_at/ends_at  ends_at NULL = never ends (only free_forever / manual)
--   amount_paid     ₹ actually charged (0 for free / manual)
--   plan_name, price_actual  snapshot, so a later price change never
--                   rewrites what someone bought
--   granted_by      the moderator, for manual / free-forever rows
--
-- Existing aggregators get a 'free_forever' Combined row (decision
-- 2026-11-04: the client's own accounts never pay). Only accounts that exist
-- when this runs — anyone who signs up later subscribes normally.
--
-- Security: plans are public facts (the homepage reads them), so anon may READ
-- active plans only. Nobody but the server (service role) writes either
-- table, and aggregator_subscriptions is not readable with the anon key at
-- all — the app reads it through server routes.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  name_en         text NOT NULL,
  name_te         text,
  duration_days   integer NOT NULL,
  actual_price    numeric(10,2) NOT NULL,
  offer_enabled   boolean NOT NULL DEFAULT false,
  offer_price     numeric(10,2),
  offer_ends_at   timestamptz,
  offer_label_en  text,
  offer_label_te  text,
  highlights_en   text,
  highlights_te   text,
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.moderators(id) ON DELETE SET NULL
);

ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_kind_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_kind_check
  CHECK (kind IN ('buying', 'selling', 'combined'));
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_name_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_name_check
  CHECK (length(btrim(name_en)) BETWEEN 1 AND 60 AND (name_te IS NULL OR length(name_te) <= 60));
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_duration_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_duration_check
  CHECK (duration_days BETWEEN 1 AND 3650);
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_price_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_price_check
  CHECK (actual_price >= 0 AND actual_price <= 1000000);
-- An offer must be a real discount. COALESCE so a NULL offer price can never
-- slip through an enabled offer (a bare comparison passes on NULL).
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_offer_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_offer_check
  CHECK (
    (offer_price IS NULL OR (offer_price >= 0 AND offer_price < actual_price))
    AND (NOT offer_enabled OR COALESCE(offer_price, -1) >= 0)
  );

CREATE INDEX IF NOT EXISTS subscription_plans_active_idx
  ON public.subscription_plans (active, sort_order);

CREATE TABLE IF NOT EXISTS public.aggregator_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_id   uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  plan_id         uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  kind            text NOT NULL,
  source          text NOT NULL,
  status          text NOT NULL DEFAULT 'active',
  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz,
  amount_paid     numeric(10,2) NOT NULL DEFAULT 0,
  plan_name       text,
  price_actual    numeric(10,2),
  granted_by      uuid REFERENCES public.moderators(id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_kind_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_kind_check
  CHECK (kind IN ('buying', 'selling', 'combined'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_source_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_source_check
  CHECK (source IN ('payment', 'free_plan', 'manual', 'free_forever'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_status_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'cancelled'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_dates_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_dates_check
  CHECK (
    (ends_at IS NULL OR ends_at > starts_at)
    -- Only a moderator's grant may run forever; anything bought or free has an end.
    AND (ends_at IS NOT NULL OR source IN ('free_forever', 'manual'))
  );
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_amount_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_amount_check
  CHECK (amount_paid >= 0 AND (source = 'payment' OR amount_paid = 0));

CREATE INDEX IF NOT EXISTS aggregator_subscriptions_holder_idx
  ON public.aggregator_subscriptions (aggregator_id, status, ends_at);

-- ── Security ─────────────────────────────────────────────────────
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregator_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_plans FROM anon, authenticated;
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
DROP POLICY IF EXISTS subscription_plans_public_read ON public.subscription_plans;
CREATE POLICY subscription_plans_public_read ON public.subscription_plans
  FOR SELECT TO anon, authenticated USING (active = true);

REVOKE ALL ON public.aggregator_subscriptions FROM anon, authenticated;
-- (no policies: service role only)

-- ── Existing aggregators: free forever ───────────────────────────
INSERT INTO public.aggregator_subscriptions (aggregator_id, kind, source, status, starts_at, ends_at, amount_paid, plan_name, note)
SELECT f.id, 'combined', 'free_forever', 'active', now(), NULL, 0, 'Free forever',
       'Existing aggregator when subscriptions launched — free forever (decision 2026-11-04)'
FROM public.farmers f
WHERE f.account_type = 'aggregator'
  AND NOT EXISTS (
    SELECT 1 FROM public.aggregator_subscriptions s
    WHERE s.aggregator_id = f.id AND s.source = 'free_forever'
  );
