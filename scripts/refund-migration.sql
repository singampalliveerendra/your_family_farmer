-- ================================================================
-- YFF Refund tracking migration  (feature #1 — Automatic refunds)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (idempotent).
-- ================================================================
--
-- Records the real Razorpay refund issued when a farmer declines (or a
-- buyer cancels) a PAID order. refund_status already exists from an
-- earlier migration; these add the details needed to track it.
--
--   refund_status : 'initiated' (manual/UPI) | Razorpay status
--                   ('processed' | 'pending' | 'failed')
--   refund_id     : Razorpay refund id (rfnd_...)
--   refund_amount : amount refunded, in rupees
--   refunded_at   : when the refund was created

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_id     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at   timestamptz;
