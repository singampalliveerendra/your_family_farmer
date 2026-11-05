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

-- 1. farm-images — PUBLIC to READ (photo links work for everyone).
--    NO public write since scripts/seller-writes-lockdown.sql (2026-11-05):
--    uploads use a one-time signed link from /api/uploads/farm-image for one
--    path in the caller's own folder. No list policy either — public photo
--    links never need one. Photos only, 8 MB max.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('farm-images', 'farm-images', true, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE SET public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "farm-images public read" ON storage.objects;
DROP POLICY IF EXISTS "farm-images public upload" ON storage.objects;
DROP POLICY IF EXISTS "farm-images public update" ON storage.objects;
DROP POLICY IF EXISTS "farm-images public delete" ON storage.objects;

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

-- 4. cargo-bills — PRIVATE. Transport / cargo bills on bulk orders
--    (scripts/transport-bill-migration.sql, 2026-11-05). No policies: the
--    server uploads through signed links and hands short-lived download links
--    to the order's buyer, seller and moderators only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cargo-bills', 'cargo-bills', false, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

