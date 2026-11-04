-- ================================================================
-- YFF Aggregator subscriptions, part 2: paying for a plan (Phase 4)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Needs scripts/subscription-migration.sql first.
-- Safe to run twice (IF NOT EXISTS / DROP ... IF EXISTS).
-- STATUS: applied to STAGING 2026-11-04 (migration `aggregator_subscription_payments`;
-- 4 good + 8 bad/duplicate cases probed, anon read/write refused). NOT on prod.
-- ================================================================
--
-- aggregator_subscriptions gains what a paid plan needs:
--   cashfree_order_id  our Cashfree order id ("gs_…"), one per attempt
--   payment_ref        Cashfree's payment id once paid
--   payment_label      "UPI · PhonePe" etc., for the receipt
--   paid_at            when Cashfree confirmed the full amount
--   receipt_no         GGS-YYYYMMDD-XXXXXX, set when a paid or ₹0 plan starts
--   duration_days      copied from the plan at purchase (the plan may change)
--   start_mode         'now' | 'after_current' — the aggregator's choice when
--                      they already hold a plan (decision 2026-11-04: start
--                      after the current one ends, or pay full to start now)
-- A payment row is created 'pending' with the amount it will charge
-- (amount_paid) and only becomes 'active' once Cashfree says PAID in full —
-- by the browser's verify, the webhook, or the nightly reconcile, whichever
-- comes first (the update is guarded on status = 'pending', so only one wins).
--
-- subscription_listing_holds — a moderator's "Hide listings" after a plan has
-- been over for 10+ days (decision 2026-11-04: listings stay up 10 days, the
-- moderator calls, then hides). Each hidden listing remembers the status it
-- had, so "Restore" (or paying again) puts back exactly what was there.
--
-- Security: both stay server-only (no anon access), like the first part.
-- ================================================================

ALTER TABLE public.aggregator_subscriptions
  ADD COLUMN IF NOT EXISTS cashfree_order_id text,
  ADD COLUMN IF NOT EXISTS payment_ref       text,
  ADD COLUMN IF NOT EXISTS payment_label     text,
  ADD COLUMN IF NOT EXISTS paid_at           timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_no        text,
  ADD COLUMN IF NOT EXISTS duration_days     integer,
  ADD COLUMN IF NOT EXISTS start_mode        text NOT NULL DEFAULT 'now';

CREATE UNIQUE INDEX IF NOT EXISTS aggregator_subscriptions_cashfree_order_idx
  ON public.aggregator_subscriptions (cashfree_order_id) WHERE cashfree_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS aggregator_subscriptions_receipt_idx
  ON public.aggregator_subscriptions (receipt_no) WHERE receipt_no IS NOT NULL;

ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_start_mode_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_start_mode_check
  CHECK (start_mode IN ('now', 'after_current'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_duration_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_duration_check
  CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650);
-- A payment row only counts once it is really paid: an ACTIVE payment row must
-- name its Cashfree order and when it was paid.
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_paid_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_paid_check
  CHECK (source <> 'payment' OR status <> 'active' OR (cashfree_order_id IS NOT NULL AND paid_at IS NOT NULL));
-- Only payment rows carry a Cashfree order.
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_cashfree_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_cashfree_check
  CHECK (cashfree_order_id IS NULL OR source = 'payment');

CREATE INDEX IF NOT EXISTS aggregator_subscriptions_ending_idx
  ON public.aggregator_subscriptions (status, ends_at);

CREATE TABLE IF NOT EXISTS public.subscription_listing_holds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_id   uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  listing_id      uuid NOT NULL REFERENCES public.produce_listings(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  held_at         timestamptz NOT NULL DEFAULT now(),
  held_by         uuid REFERENCES public.moderators(id) ON DELETE SET NULL,
  released_at     timestamptz
);
-- A listing is held at most once at a time.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_listing_holds_open_idx
  ON public.subscription_listing_holds (listing_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS subscription_listing_holds_agg_idx
  ON public.subscription_listing_holds (aggregator_id, released_at);

ALTER TABLE public.subscription_listing_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_listing_holds FROM anon, authenticated;
-- (no policies: service role only)
