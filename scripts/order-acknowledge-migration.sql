-- ================================================================
-- Order Acknowledge Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- When a farmer declines an order (or an order is cancelled), it used to drop
-- straight into the buyer's order history — confusing, because the buyer never
-- saw what happened. Now a declined/cancelled order stays in the buyer's ACTIVE
-- list with an "Acknowledge" button, and only moves to history once the buyer
-- taps it. acknowledged_at records when they did.
-- ================================================================

alter table public.orders
  add column if not exists acknowledged_at timestamptz;

comment on column public.orders.acknowledged_at is
  'When the buyer acknowledged a declined/cancelled order (moves it to history)';
