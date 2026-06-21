-- ================================================================
-- Order Acknowledge Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Things used to drop straight into history with no acknowledgement, confusing
-- whoever didn't initiate them. acknowledged_at fixes both directions with one
-- column (the acknowledger is implied by the order's status):
--   * FARMER DECLINES  → the order stays in the BUYER's active list with an
--     "Acknowledge" button; tapping it stamps acknowledged_at and moves it to
--     the buyer's history.
--   * BUYER CANCELS    → the order stays in the FARMER's active dashboard with
--     an "Acknowledge" button; tapping it stamps acknowledged_at and moves it
--     to the farmer's order history.
-- ================================================================

alter table public.orders
  add column if not exists acknowledged_at timestamptz;

comment on column public.orders.acknowledged_at is
  'When a declined/cancelled order was acknowledged (buyer acks farmer declines; farmer acks buyer cancellations) — moves it to history';
