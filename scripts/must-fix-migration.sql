-- ================================================================
-- YFF Must-Fix Migration
-- 1. Atomic stock decrement RPCs (prevents overselling)
-- 2. service_pincodes[] on delivery_boys (route deliveries by pincode)
-- 3. delivery_fee + rider_payout on orders (pay riders sustainably)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
-- ================================================================

-- 1. Stock decrement / increment
-- decrement_stock returns true only if the row had enough stock (or
-- unlimited NULL stock). Treating the UPDATE + ROW_COUNT check as a
-- single transactional statement is what makes this race-safe.

CREATE OR REPLACE FUNCTION decrement_stock(p_listing_id uuid, p_qty numeric)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  affected int;
  has_null_stock boolean;
BEGIN
  UPDATE produce_listings
  SET stock_qty = stock_qty - p_qty
  WHERE id = p_listing_id
    AND stock_qty IS NOT NULL
    AND stock_qty >= p_qty;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RETURN TRUE;
  END IF;

  -- No row updated. Either the listing is missing, stock_qty was too low,
  -- or stock_qty is NULL (unlimited). Treat NULL stock as success.
  SELECT (stock_qty IS NULL) INTO has_null_stock
  FROM produce_listings WHERE id = p_listing_id;

  RETURN COALESCE(has_null_stock, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION increment_stock(p_listing_id uuid, p_qty numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE produce_listings
  SET stock_qty = stock_qty + p_qty
  WHERE id = p_listing_id AND stock_qty IS NOT NULL;
END;
$$;

-- Lock decrement_stock down: Postgres defaults to PUBLIC EXECUTE, which would
-- let the anon key in every browser bundle drain stock to 0 on any listing.
-- Only API routes (service_role) should call it.
REVOKE EXECUTE ON FUNCTION decrement_stock(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION decrement_stock(uuid, numeric) TO service_role;

-- increment_stock is intentionally left callable from the anon client because
-- the farmer dashboard still calls it directly when a farmer declines an
-- order (to return reserved stock). The blast-radius is "attacker inflates
-- a farmer's stock_qty" — annoying, not catastrophic. Tighten once the
-- farmer dashboard moves all mutations behind authenticated API routes.

-- 2. Rider service pincodes — 6-digit strings the rider commits to cover.
-- An empty / NULL array means "no preference, show everything" so legacy
-- accounts keep working until they edit their profile.
ALTER TABLE delivery_boys
  ADD COLUMN IF NOT EXISTS service_pincodes text[];

CREATE INDEX IF NOT EXISTS idx_delivery_boys_service_pincodes
  ON delivery_boys USING gin (service_pincodes);

-- 3. Delivery fee + rider payout on orders.
-- For a multi-row batch (one cart → many produce rows) we stamp the full
-- fee on the FIRST row only and 0 on the rest, so SUM(rider_payout) over
-- a batch equals one fee.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_payout integer DEFAULT 0;
