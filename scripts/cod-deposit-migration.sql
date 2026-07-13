-- ================================================================
-- YFF — Part-paid COD (deposit online, balance in cash)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Full COD let a buyer cancel a confirmed order having risked nothing, after
-- the farmer had already harvested for it. Now a COD order takes a deposit
-- online at checkout and the rest in cash at the door. The deposit is
-- forfeited if the BUYER cancels (that is the whole point of it) and refunded
-- in full if the FARMER declines or cancels.
--
-- The deposit is also never smaller than the platform fee, so the moderator's
-- commission is actually collected on COD orders instead of living only in
-- cash between buyer and farmer.
-- ================================================================

-- Deposit percentage, alongside the existing commission percentage. 10 → 10%.
-- Setting it to 0 turns part-payment off and COD behaves as it did before.
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS cod_deposit_percent numeric NOT NULL DEFAULT 10;

COMMENT ON COLUMN platform_settings.cod_deposit_percent IS
  'Percent of the produce subtotal a COD buyer prepays. 0 disables part-payment.';

-- Money, per order row (like platform_fee, and unlike delivery_fee which is
-- one-per-cart). Per row means cancelling or declining a single line forfeits
-- or refunds exactly that line''s own deposit.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_deposit        numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_balance_due    numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_deposit_paid_at timestamptz;

-- Stamped by the rider when they take the cash balance at the door, and by the
-- farmer for a self-pickup COD collected at the farm.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_collected_at   timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_collected_by   uuid;

-- Set when a buyer cancels a deposit-paid order and keeps nothing back.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_forfeited_at timestamptz;

COMMENT ON COLUMN orders.cod_deposit IS
  'Rupees prepaid online at checkout on a COD order. Non-refundable on buyer cancel.';
COMMENT ON COLUMN orders.cod_balance_due IS
  'Rupees still owed in cash at handover: produce + platform fee + delivery fee - deposit.';
COMMENT ON COLUMN orders.cash_collected_by IS
  'delivery_boys.id of the rider who took the cash. NULL when the farmer collected it.';

-- payment_status gains a third state. Historically it meant only "in" or "not
-- in":
--   pending | payment_claimed | pending_confirmation | paid | completed
-- A part-paid COD order is neither:
--   deposit_paid — deposit is in, cash balance still owed at the door.
-- It becomes 'completed' once the cash is collected. See src/lib/payment.ts —
-- isOrderPaid() deliberately does NOT count deposit_paid as paid.
COMMENT ON COLUMN orders.payment_status IS
  'pending | payment_claimed | pending_confirmation | deposit_paid | paid | completed';

CREATE INDEX IF NOT EXISTS idx_orders_cod_balance
  ON orders (payment_status) WHERE payment_status = 'deposit_paid';
