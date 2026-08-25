-- ================================================================
-- YFF / Go Grameen — sell in multiples of a part-unit ("sale step")
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Why: a buyer generally takes 250 g of mirchi, not 1 kg, and there was no
-- way to sell in anything but whole units. `sale_step` is the smallest
-- quantity a produce can be bought in; the consumer's +/− moves by it.
--
-- NULL means 1 — exactly how every existing listing already behaves — so no
-- backfill is needed and untouched rows are unaffected.
-- ================================================================

-- 1. The step itself. numeric(6,3): 0.001 is finer than anyone can weigh, and
--    three decimals matches the rounding the client code does.
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS sale_step numeric(6,3);

COMMENT ON COLUMN produce_listings.sale_step IS
  'Smallest sellable quantity, in the listing''s own unit. NULL = 1 (whole units).';

-- 2. Widen the integer columns that would otherwise truncate a part-unit.
--    orders.quantity is already numeric(8,2) and harvests.stock_qty is already
--    numeric, so those need nothing — the authoritative stock for a sale is the
--    harvest's, and it was ready for this.
ALTER TABLE produce_listings
  ALTER COLUMN stock_qty TYPE numeric(10,3);

-- 3. Price tiers are thresholds in the same unit, so they have to be able to
--    say "up to 2.5 kg" once fractional orders exist.
ALTER TABLE produce_listings
  ALTER COLUMN price_tier_1_qty TYPE numeric(10,3),
  ALTER COLUMN price_tier_2_qty TYPE numeric(10,3),
  ALTER COLUMN price_tier_3_qty TYPE numeric(10,3);

-- decrement_stock / increment_stock / decrement_harvest_stock already take
-- `p_qty numeric`, so no function changes are needed.

-- 4. Guard against a step that can never be satisfied.
ALTER TABLE produce_listings
  DROP CONSTRAINT IF EXISTS produce_listings_sale_step_positive;
ALTER TABLE produce_listings
  ADD CONSTRAINT produce_listings_sale_step_positive
  CHECK (sale_step IS NULL OR sale_step > 0);

-- 5. PostgREST answers from a cached copy of the schema, and it is that cache
--    that produces "Could not find the 'sale_step' column of 'produce_listings'
--    in the schema cache" in the app. Supabase reloads it on DDL by itself, but
--    saying so costs nothing and removes the "did it just not refresh?" doubt.
NOTIFY pgrst, 'reload schema';

-- Verify:
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'produce_listings'
  AND column_name IN ('sale_step', 'stock_qty', 'price_tier_1_qty', 'price_tier_2_qty', 'price_tier_3_qty')
ORDER BY column_name;
