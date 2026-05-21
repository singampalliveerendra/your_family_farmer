-- ================================================================
-- Razorpay Online Payment Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Adds the columns needed to track a Razorpay-collected payment.
-- Unlike the direct farmer-UPI flow, money is collected into the
-- PLATFORM's Razorpay account; settlement to farmers happens
-- separately. payment_method is stored as 'razorpay'.
-- ================================================================

-- Razorpay's own order id (rzp_order_xxx), created server-side before
-- we open Checkout. We keep it so a webhook / retry can be matched back
-- to our order rows.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id text;

-- The payment id (pay_xxx) Razorpay returns once the buyer pays. Stored
-- only after the signature has been verified server-side.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

-- Look up our rows quickly when a webhook arrives keyed by Razorpay order id.
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders(razorpay_order_id);
