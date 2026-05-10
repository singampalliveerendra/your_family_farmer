-- ================================================================
-- YFF — Payment screenshot upload (mandatory for UPI orders)
-- Run AFTER orders-consumer-id-migration.sql
-- ================================================================

-- Object path inside the private 'payment-proofs' storage bucket. Never store
-- a public URL — clients fetch a signed URL via /api/orders/[id]/proof.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_proof_path text;

-- Private bucket. The anon key has no policies on it, so only API routes
-- (using the service role) can upload, list, or sign URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;
