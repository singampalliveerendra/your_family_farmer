-- ================================================================
-- YFF Selling in packs — retail packs (kg/gram) + wholesale pack price
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Run AFTER scripts/wholesale-migration.sql (needs wholesale_pack_size).
-- Safe to run twice (IF NOT EXISTS / DROP ... IF EXISTS).
-- STATUS: see the memory notes / CHECK-prod-migrations.sql, not this line.
-- ================================================================
--
-- Client card 2026-11-10, "How do you want to sell?":
--   Retail    → Unit; Pack size (kg/gram only, from a fixed list); price of
--               ONE pack; "buy more, save more" tiers counted in packs.
--               No pack size = sold loose by the unit, exactly as before.
--   Wholesale → Unit; with a pack size the minimum is one pack and the farmer
--               prices one pack; otherwise a minimum quantity + price per unit.
--
-- Rules live in src/lib/packPricing.ts and src/lib/wholesale.ts; these CHECKs
-- are the last line. Orders are charged packs × price per pack, so the pack
-- price is stored exactly as typed. The old per-unit columns are still filled
-- in (derived) for readers that do not know packs yet (the Android app).
--
--   retail_pack_size     numeric(10,3)  in the listing's own unit (0.25 = 250 g on kg)
--   retail_pack_price    numeric(8,2)   ₹ for one pack
--   retail_pack_tiers    jsonb          [{ "min_packs": 5, "price": 22 }, …] at most 2
--   wholesale_pack_price numeric(8,2)   ₹ for one wholesale pack

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS retail_pack_size numeric(10,3),
  ADD COLUMN IF NOT EXISTS retail_pack_price numeric(8,2),
  ADD COLUMN IF NOT EXISTS retail_pack_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS wholesale_pack_price numeric(8,2);

-- A retail pack is a size AND a price, or neither; tiers only with a pack.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_pack_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_pack_check
  CHECK (
    (retail_pack_size IS NULL AND retail_pack_price IS NULL)
    -- IS NOT NULL spelled out: a bare "> 0" on a NULL passes a CHECK.
    OR (retail_pack_size IS NOT NULL AND retail_pack_price IS NOT NULL AND retail_pack_size > 0 AND retail_pack_price > 0)
  );
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_pack_tiers_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_pack_tiers_check
  CHECK (
    jsonb_typeof(retail_pack_tiers) = 'array'
    AND jsonb_array_length(retail_pack_tiers) <= 2
    AND (retail_pack_size IS NOT NULL OR jsonb_array_length(retail_pack_tiers) = 0)
  );

-- A wholesale pack price only goes with a wholesale pack size.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_pack_price_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_pack_price_check
  CHECK (wholesale_pack_price IS NULL OR (wholesale_pack_price > 0 AND wholesale_pack_size IS NOT NULL));
