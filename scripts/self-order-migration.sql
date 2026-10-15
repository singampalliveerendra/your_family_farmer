-- ================================================================
-- YFF Orders: farmers may order their own produce
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================
--
-- /api/orders/place used to refuse an order whose buyer phone matched the
-- farmer's. Farmers now may buy their own produce (for their household, a
-- relative, a walk-in sale they want on the books). The order is an ordinary
-- order in every respect — stock is claimed, the farmer approves it, it is
-- fulfilled and paid like any other — it is just MARKED, so the farmer's
-- order list and report can tell "sold to buyers" from "taken by me" while the
-- quantity totals still include both.
--
-- Safe to run before or after the code deploys: the route only names this
-- column on a self-order, retries without it if it is missing, and every read
-- falls back to the list without it.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_self_order boolean NOT NULL DEFAULT false;
