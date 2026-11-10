-- ================================================================
-- YFF Delivery step — courier type (local / cargo), cargo services, who pays
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Run AFTER scripts/retail-reach-migration.sql (cargo writes retail_reach).
-- Safe to run twice (IF NOT EXISTS / DROP ... IF EXISTS).
-- STATUS: see the memory notes / CHECK-prod-migrations.sql, not this line.
-- ================================================================
--
-- Client card 2026-11-10, "Delivery" after "How do you want to sell?":
--   Pickup only → the farmer's pickup points (on the profile, unchanged)
--   I will courier / Both → Local (radius) or Cargo (services taking ToPay),
--   and who bears the delivery: farmer (free for the buyer) or buyer
--   (local: the farmer's charge; cargo: ToPay to the cargo company).
-- Rules: src/lib/courierOptions.ts. These CHECKs are the last line.

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS courier_type text,
  ADD COLUMN IF NOT EXISTS cargo_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_paid_by text;

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_courier_type_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_courier_type_check
  CHECK (courier_type IS NULL OR courier_type IN ('local', 'cargo'));

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_delivery_paid_by_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_delivery_paid_by_check
  CHECK (delivery_paid_by IS NULL OR delivery_paid_by IN ('farmer', 'buyer'));

-- Cargo needs at least one service; nothing else may carry a list.
-- (IS NOT NULL spelled out where it matters: a bare comparison on NULL passes a CHECK.)
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_cargo_services_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_cargo_services_check
  CHECK (
    jsonb_typeof(cargo_services) = 'array'
    AND jsonb_array_length(cargo_services) <= 12
    AND (
      (courier_type IS NOT NULL AND courier_type = 'cargo' AND jsonb_array_length(cargo_services) >= 1)
      OR ((courier_type IS NULL OR courier_type <> 'cargo') AND jsonb_array_length(cargo_services) = 0)
    )
  );

-- A courier type always says who pays.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_courier_paid_by_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_courier_paid_by_check
  CHECK (courier_type IS NULL OR delivery_paid_by IS NOT NULL);
