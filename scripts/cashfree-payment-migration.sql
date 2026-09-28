-- Cashfree Payment Gateway (replaces Razorpay, 2026-09-18). STAGING first.
--
-- A cart's rows share one Cashfree order. We choose its id (gg_<row>_<ts>)
-- and stamp it at /api/orders/cashfree/create; the settled payment id lands at
-- verify / webhook / reconcile. Refunds are keyed by cashfree_order_id.
--
-- payment_method is stored as 'cashfree' for new online orders. The razorpay_*
-- columns stay: orders paid before the switch still carry them, and decline /
-- cancel flag those for a manual refund.
--
-- Idempotent — safe to run twice.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashfree_order_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashfree_payment_id text;

CREATE INDEX IF NOT EXISTS idx_orders_cashfree_order_id ON orders(cashfree_order_id);
