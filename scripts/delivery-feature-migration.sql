-- ================================================================
-- YFF — Delivery feature (rider accounts + home delivery on orders)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
-- ================================================================

-- 1. Delivery boy (rider) accounts. Service-role only; the anon key has no
--    policies on this table.
CREATE TABLE IF NOT EXISTS delivery_boys (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text         NOT NULL,
  phone           varchar(15)  UNIQUE NOT NULL,
  alt_phone       varchar(15),
  password_hash   text         NOT NULL,
  vehicle_type    text,
  vehicle_number  text,
  id_proof_path   text,
  service_areas   text,
  -- Lifecycle: pending_approval → approved (with activation_code issued) →
  -- active (after rider consumes the code). suspended = blocked from logging in.
  status          text         NOT NULL DEFAULT 'pending_approval',
  activation_code text,
  approved_at     timestamptz,
  activated_at    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_boys_phone   ON delivery_boys(phone);
CREATE INDEX IF NOT EXISTS idx_delivery_boys_status  ON delivery_boys(status);

ALTER TABLE delivery_boys ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE delivery_boys IS
  'Rider accounts. Service-role only; password scrypt-hashed; activation_code is one-time and cleared once consumed.';

-- 2. Orders — delivery type, address, rider linkage, handover OTP, timestamps.
--    'self_pickup' (default) preserves the existing flow; 'home_delivery'
--    opts in to the new rider workflow.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type        text DEFAULT 'self_pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_landmark    text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_pincode     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_alt_phone   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_boy_id      uuid REFERENCES delivery_boys(id) ON DELETE SET NULL;
-- 4-digit handover code; generated server-side at order placement for
-- delivery_type='home_delivery'. Never exposed to the rider — they must
-- collect it from the consumer at the door.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handover_otp         text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at          timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at         timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS out_for_delivery_at  timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_status   ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_boy      ON orders(delivery_boy_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_type     ON orders(delivery_type);

-- 3. Private bucket for rider ID proofs. Same pattern as payment-proofs:
--    anon has no policies, only API routes (service role) can upload/sign.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rider-id-proofs', 'rider-id-proofs', false)
ON CONFLICT (id) DO NOTHING;
