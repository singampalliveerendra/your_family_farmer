-- ================================================================
-- YFF Transport billed after delivery: per km + cargo bill (2026-11-05)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Needs scripts/bulk-orders-migration.sql first. Safe to run twice.
-- STATUS: written 2026-11-05. NOT applied anywhere yet.
-- ================================================================
--
-- Client decision 2026-11-05 — the seller picks ONE way to charge transport
-- on a bulk lot, per state:
--   per order  — fixed, paid online with the produce (already exists)
--   per km     — ₹ per km shown up front; after delivery the seller enters the
--                km, the app works out km × rate, and the buyer pays the
--                seller DIRECTLY (not through the app)
--   cargo bill — after delivery the seller uploads the actual cargo bill with
--                its amount; the buyer pays the seller directly
-- For the last two the online payment covers only the produce, and the order
-- carries the transport bill below. The seller ticks "Transport paid" when the
-- money arrives. orders stays server-only (no anon / authenticated grants).
-- ================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS transport_mode text,
  ADD COLUMN IF NOT EXISTS transport_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS transport_bill_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_bill_path text,
  ADD COLUMN IF NOT EXISTS transport_billed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transport_paid_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_mode_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_mode_check
  CHECK (transport_mode IS NULL OR transport_mode IN ('per_km', 'cargo_bill'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_bill_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_bill_check CHECK (
  (transport_rate IS NULL OR transport_rate > 0)
  AND (transport_km IS NULL OR (transport_km > 0 AND transport_km <= 5000))
  AND (transport_bill_amount IS NULL OR (transport_bill_amount >= 0 AND transport_bill_amount <= 9999999.99))
  -- Paid only after a bill was sent.
  AND (transport_paid_at IS NULL OR transport_billed_at IS NOT NULL)
);

-- The cargo bills: PRIVATE. Only the server (service role) uploads through a
-- one-time signed link and hands out short-lived download links to the buyer,
-- the seller and moderators. No public policies at all.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cargo-bills', 'cargo-bills', false, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

NOTIFY pgrst, 'reload schema';
