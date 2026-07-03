-- ================================================================
-- YFF — Harvest-as-Product (Phase 1)
-- "Show a separate Card for each Harvest, even if the produce is the same."
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Until now a harvest was a satellite of a produce_listing: the cart, the
-- order, the stock and the detail page were all keyed on produce_listing_id,
-- so two harvests of one Banana were the same product everywhere a buyer
-- looked. This migration makes the HARVEST the sellable unit:
--
--   • harvests.stock_qty  — each harvest sells its OWN quantity (was the
--                           informational approx_quantity).
--   • orders.harvest_id   — an order line records which harvest was sold.
--   • decrement_harvest_stock / increment_harvest_stock — atomic, race-safe
--                           claims that mirror the produce_listings versions.
--
-- The produce_listing stays the TEMPLATE (price tiers, photos, description,
-- farmer). Its stock_qty is untouched — the legacy produce-card checkout path
-- still uses it; harvest checkout uses harvests.stock_qty.
-- ================================================================

-- 1. Per-harvest sellable stock. Backfill from approx_quantity so already-
--    logged harvests remain sellable at the quantity the farmer entered.
--    NULL means "unlimited" (same convention as produce_listings.stock_qty).
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS stock_qty numeric;

UPDATE harvests
SET stock_qty = approx_quantity
WHERE stock_qty IS NULL AND approx_quantity IS NOT NULL;

-- 2. Which harvest an order line came from. Nullable: legacy orders (placed
--    before this migration) and the legacy produce-card path leave it NULL.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS harvest_id uuid REFERENCES harvests(id);

CREATE INDEX IF NOT EXISTS idx_orders_harvest ON orders(harvest_id);

-- 3. Atomic stock claim on a harvest — same contract as decrement_stock:
--    returns TRUE only if the harvest had enough stock (or unlimited NULL
--    stock). The UPDATE + ROW_COUNT check in one statement is what makes it
--    race-safe against two simultaneous checkouts.
CREATE OR REPLACE FUNCTION decrement_harvest_stock(p_harvest_id uuid, p_qty numeric)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  affected int;
  has_null_stock boolean;
BEGIN
  UPDATE harvests
  SET stock_qty = stock_qty - p_qty
  WHERE id = p_harvest_id
    AND stock_qty IS NOT NULL
    AND stock_qty >= p_qty;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RETURN TRUE;
  END IF;

  -- No row updated: missing harvest, stock too low, or NULL (unlimited).
  -- Treat NULL stock as success.
  SELECT (stock_qty IS NULL) INTO has_null_stock
  FROM harvests WHERE id = p_harvest_id;

  RETURN COALESCE(has_null_stock, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION increment_harvest_stock(p_harvest_id uuid, p_qty numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE harvests
  SET stock_qty = stock_qty + p_qty
  WHERE id = p_harvest_id AND stock_qty IS NOT NULL;
END;
$$;

-- Lock the decrement to service_role only (same reasoning as decrement_stock:
-- the anon key ships in every browser bundle and must not drain stock).
-- increment stays anon-callable for the farmer dashboard's decline/return flow.
REVOKE EXECUTE ON FUNCTION decrement_harvest_stock(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION decrement_harvest_stock(uuid, numeric) TO service_role;
