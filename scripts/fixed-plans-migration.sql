-- ================================================================
-- YFF Aggregator plans: exactly THREE fixed plans
--   Buying · Selling · Buying + Selling (combined) — one of each
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Run AFTER scripts/subscription-migration.sql.
-- Safe to run twice (NOT EXISTS / IF EXISTS).
-- STATUS: see the memory notes / CHECK-prod-migrations.sql, not this line.
-- ================================================================
--
-- Client card, 2026-11-10: "We should be having 2 plans, one for buying in
-- bulk and other for selling, for aggregator. Each plan price and duration
-- should be configurable by a moderator." Same day the user added a third,
-- Buying + Selling, with the same edit options. Moderators edit the three
-- (price, duration, offer, show/hide); they cannot add or delete plans.
--
-- Replaces scripts/two-plans-migration.sql (staging only, never on prod):
-- this drops what that one added — the Buying/Selling-only unique index and
-- the "no Combined plan on show" check.
--
-- What this does:
--   1. Creates each of the three plans if missing, HIDDEN and at ₹0, so
--      nothing goes on sale until a moderator sets the price and duration and
--      presses "Show to aggregators". An existing plan is left exactly as it
--      is (staging keeps its "Bulk buyer monthly" combined row).
--   2. At most one plan of each kind, from now on.
-- It refuses to run if a kind already has two plans: hide/merge them first.
--
-- aggregator_subscriptions is not touched: the client's own aggregators keep
-- their free-forever Combined rows.

-- 0. Undo the two-plans version (no-ops where it never ran).
DROP INDEX IF EXISTS public.subscription_plans_one_per_kind;
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_no_combined_on_show;

-- 1. The three plans (hidden until a moderator prices them).
INSERT INTO public.subscription_plans (kind, name_en, name_te, duration_days, actual_price, offer_enabled, highlights_en, highlights_te, active, sort_order)
SELECT 'buying', 'Buying plan', 'కొనుగోలు ప్లాన్', 30, 0, false,
       E'See every bulk listing\nFarmer phone numbers and addresses\nBuy bulk and pay online',
       E'ప్రతి బల్క్ లిస్టింగ్ చూడండి\nరైతుల ఫోన్ నంబర్లు, చిరునామాలు\nబల్క్‌గా కొని ఆన్‌లైన్‌లో చెల్లించండి',
       false, 1
 WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE kind = 'buying');

INSERT INTO public.subscription_plans (kind, name_en, name_te, duration_days, actual_price, offer_enabled, highlights_en, highlights_te, active, sort_order)
SELECT 'selling', 'Selling plan', 'అమ్మకం ప్లాన్', 30, 0, false,
       E'Sell retail, wholesale or both\nYour growers named on every listing\nReceipt for every payment',
       E'చిల్లర, హోల్‌సేల్ లేదా రెండూ అమ్మండి\nప్రతి లిస్టింగ్‌పై మీ రైతుల పేర్లు\nప్రతి చెల్లింపుకు రసీదు',
       false, 2
 WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE kind = 'selling');

INSERT INTO public.subscription_plans (kind, name_en, name_te, duration_days, actual_price, offer_enabled, highlights_en, highlights_te, active, sort_order)
SELECT 'combined', 'Buying + Selling plan', 'కొనుగోలు + అమ్మకం ప్లాన్', 30, 0, false,
       E'Everything in the Buying plan\nEverything in the Selling plan\nOne plan, one payment',
       E'కొనుగోలు ప్లాన్‌లోని అన్నీ\nఅమ్మకం ప్లాన్‌లోని అన్నీ\nఒకే ప్లాన్, ఒకే చెల్లింపు',
       false, 3
 WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE kind = 'combined');

-- 2. One plan per kind.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_kind_unique
  ON public.subscription_plans (kind);
