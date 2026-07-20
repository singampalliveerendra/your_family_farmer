-- ================================================================
-- YFF — Delivery charge (moderator-set) + multi-farmer checkout linkage
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run. Run in BOTH prod and staging.
--
-- Model: one delivery charge per checkout =
--   base + extra × (number_of_farmers - 1)
-- The base covers the rider's trip; each additional farmer is another pickup
-- stop, so it adds `extra`. Refunds recompute on how many farmers remain.
-- ================================================================

-- 1. Moderator-set charges. Two columns on the existing single-row settings
--    table (id = 1), alongside fee_percent. Defaults match the launch pricing
--    (base ₹30, extra ₹15) so a fresh row already behaves as specified.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS delivery_base_fee  numeric NOT NULL DEFAULT 30;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS delivery_extra_fee numeric NOT NULL DEFAULT 15;

-- The singleton row already exists once platform-fee-migration.sql ran; make
-- sure it does here too (idempotent) so a delivery-only deploy still works.
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Checkout linkage. A multi-farmer cart is placed as one order batch PER
--    farmer (separate rows, separate payments). checkout_id ties those sibling
--    batches together so decline/cancel can count the farmers still in the
--    checkout and refund the exact drop in the delivery charge. NULL on every
--    order placed before this migration — those keep the old per-order refund
--    path and are unaffected.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_id uuid;
CREATE INDEX IF NOT EXISTS idx_orders_checkout_id ON orders(checkout_id) WHERE checkout_id IS NOT NULL;

-- 3. How much of a row's stamped delivery_fee has already been given back.
--    Lets a partial delivery refund (e.g. one farmer of several drops out) and
--    any later residual refund never double-pay. 0 = nothing refunded yet.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_refunded numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.checkout_id IS
  'Groups the per-farmer order batches of a single multi-farmer checkout, so the delivery charge (base + extra per extra farmer) and its refunds are computed across all farmers. NULL for legacy pre-migration orders.';
COMMENT ON COLUMN orders.delivery_fee_refunded IS
  'Rupees of this row''s delivery_fee already refunded. Prevents double-refunding the delivery charge across sibling cancellations.';
