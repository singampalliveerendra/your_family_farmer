-- ================================================================
-- YFF Aggregator plans: exactly TWO plans, Buying and Selling
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Run AFTER scripts/subscription-migration.sql.
-- Safe to run twice (NOT EXISTS / DROP ... IF EXISTS).
-- STATUS: see the memory notes / CHECK-prod-migrations.sql, not this line.
-- ================================================================
--
-- Client card, 2026-11-10: "We should be having 2 plans, one for buying in
-- bulk and other for selling, for aggregator. Each plan price and duration
-- should be configurable by a moderator."
--
-- What this does:
--   1. Hides every Combined plan. It is kept (not deleted) because
--      aggregator_subscriptions.plan_id may point at it, and it can never be
--      shown or bought again (check 3).
--   2. Creates the Buying plan and the Selling plan if they are missing,
--      HIDDEN and at ₹0, so nothing goes on sale until a moderator sets the
--      price and duration and presses "Show to aggregators".
--   3. At most one plan of each kind, and no shown Combined plan, ever.
--
-- What it does NOT touch: aggregator_subscriptions. 'combined' stays a valid
-- SUBSCRIPTION kind: the client's own aggregators keep their free-forever
-- Combined rows (buying + selling, free, no end), and anyone who already paid
-- for the old Combined plan keeps it until it ends.

-- 1. No Combined plan on show.
UPDATE public.subscription_plans
   SET active = false, updated_at = now()
 WHERE kind = 'combined' AND active;

-- 2. The two plans (hidden until a moderator prices them).
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

-- 3. Keep it that way.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_one_per_kind
  ON public.subscription_plans (kind) WHERE kind IN ('buying', 'selling');

ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_no_combined_on_show;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_no_combined_on_show
  CHECK (kind <> 'combined' OR NOT active);
