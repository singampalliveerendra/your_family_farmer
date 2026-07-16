-- ============================================================
-- Supabase Storage setup: ALL buckets the app needs.
-- Run this in the SQL Editor of any NEW environment (staging, etc.)
-- so image uploads work. Idempotent — safe to re-run.
--
-- Mirrors what prod already has. The per-feature migrations
-- (farm-images-bucket.sql, payment-proof-migration.sql,
-- delivery-feature-migration.sql) each create one of these;
-- this file is the whole set in one place.
-- ============================================================

-- 1. farm-images — PUBLIC. Farmer/harvest/produce photos.
--    Anon-write, matching the public-write model used elsewhere in the MVP.
INSERT INTO storage.buckets (id, name, public)
VALUES ('farm-images', 'farm-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "farm-images public read" ON storage.objects;
CREATE POLICY "farm-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'farm-images');

DROP POLICY IF EXISTS "farm-images public upload" ON storage.objects;
CREATE POLICY "farm-images public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'farm-images');

DROP POLICY IF EXISTS "farm-images public update" ON storage.objects;
CREATE POLICY "farm-images public update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'farm-images');

DROP POLICY IF EXISTS "farm-images public delete" ON storage.objects;
CREATE POLICY "farm-images public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'farm-images');

-- 2. payment-proofs — PRIVATE. Consumer UPI screenshots.
--    No anon policies: only API routes (service role) upload/list/sign.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 3. rider-id-proofs — PRIVATE. Aadhaar/DL photos from rider signup.
--    Same service-role-only pattern as payment-proofs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rider-id-proofs', 'rider-id-proofs', false)
ON CONFLICT (id) DO NOTHING;
