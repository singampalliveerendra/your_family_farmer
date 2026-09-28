-- ================================================================
-- YFF Orders: pre-orders (buy now, next harvest)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================
--
-- A buyer may now order a produce whose latest harvest is finished. The line
-- takes NO stock (there is none to take): /api/orders/place skips the
-- decrement_stock claim for it and records the order as a pre-order instead.
-- The farmer approves it against their next pick, and a decline refunds it
-- through the path every declined paid order already uses.
--
-- Without these columns a pre-order is indistinguishable from an ordinary one,
-- which would show the farmer an order for produce they have no stock of and
-- give the buyer no idea they are waiting. The route therefore REFUSES to place
-- a pre-order until this has been run, rather than quietly placing a normal one.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false;

-- The next-harvest date the buyer was shown when they agreed to wait, derived
-- from the listing's harvest frequency. Stored so the farmer sees the same date
-- the promise was made on, even after they change the frequency.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preorder_expected_date date;

-- The farmer dashboard's "waiting for harvest" bucket reads this.
CREATE INDEX IF NOT EXISTS idx_orders_preorder
  ON orders (farmer_id, created_at DESC)
  WHERE is_preorder;
