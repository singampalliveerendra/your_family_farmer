-- ================================================================
-- YFF Idempotency migration  (feature #3 — duplicate order/payment guard)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (idempotent).
-- ================================================================
--
-- On slow 4G a buyer may double-tap "Place order", or the response may be
-- lost and the app retries. The client sends one idempotency_key per
-- checkout attempt; if rows with that key already exist we return them
-- instead of inserting a second set (and decrementing stock twice).
--
-- All rows from a single cart share the same key, so this is a plain index,
-- not a unique constraint.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
