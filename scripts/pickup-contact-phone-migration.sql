-- ================================================================
-- YFF — Pickup contact phone
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Home delivery already lets the buyer leave a second number
-- (orders.delivery_alt_phone) so the rider can reach someone at the door.
-- Self-pickup had no equivalent: the farmer waiting at the pickup point had
-- only the account's buyer_phone, which is often the phone that placed the
-- order rather than the phone of whoever actually turns up to collect.
--
-- This column holds the number to call AT the pickup point. Optional — an
-- empty one just means "use buyer_phone".
-- ================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_phone text;

COMMENT ON COLUMN orders.pickup_phone IS
  'Optional contact number for a self-pickup order, given by the buyer at checkout. Whom the farmer calls at the pickup point; falls back to buyer_phone when empty.';
