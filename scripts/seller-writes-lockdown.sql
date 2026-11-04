-- ================================================================
-- YFF Security fix: the public key can no longer write seller data,
-- read farmers' private details, or touch buyers' demand requests.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run twice (DROP POLICY IF EXISTS / REVOKE / GRANT are idempotent).
-- Undo: scripts/seller-writes-lockdown-rollback.sql
-- STATUS: written 2026-11-05. NOT applied anywhere yet.
-- ================================================================
--
-- DEPLOY ORDER MATTERS: the app code that moves these writes behind login-
-- checked server routes (/api/farmer/listings, /api/farmer/harvests,
-- /api/farmer/profile, /api/farmer/media, /api/uploads/farm-image,
-- /api/consumer/intents, /api/moderator/harvests …) must be LIVE first.
-- Run this before that deploy and every farmer's dashboard save fails.
--
-- Why: the anon key ships inside the website's JavaScript, so anyone could
-- use it. Before this fix, with that key alone, anybody could:
--   • add, edit or delete ANY farmer's produce and harvests (prices, stock);
--   • rewrite ANY farmer's name, phone, page link, address, UPI ID;
--   • read every farmer's phone, farm address, exact GPS and pickup phones,
--     and every aggregator's growers' phones and addresses;
--   • read, edit and delete every buyer's demand request (name, phone,
--     delivery location);
--   • upload, overwrite or delete any photo in farm-images (no size or type
--     limit), and list every file in it.
--
-- After: the browser key can still READ public profile and produce data, so
-- every public page works as before. Who sees the hidden fields (decided
-- 2026-11-04): the seller themselves, moderators, an aggregator with a Buying
-- plan in the bulk market, and a buyer on their own order — all through
-- server routes using the service role, which this script does not touch.
-- ================================================================

BEGIN;

-- ── 1. Produce, harvests, gallery photos: read-only for the public ──────
DROP POLICY IF EXISTS "Allow insert produce"           ON public.produce_listings;
DROP POLICY IF EXISTS "produce_listings public update" ON public.produce_listings;
DROP POLICY IF EXISTS "produce_listings public delete" ON public.produce_listings;
DROP POLICY IF EXISTS "harvests public insert"         ON public.harvests;
DROP POLICY IF EXISTS "harvests public update"         ON public.harvests;
DROP POLICY IF EXISTS "harvests public delete"         ON public.harvests;
DROP POLICY IF EXISTS "Allow insert media"             ON public.media;
DROP POLICY IF EXISTS "media public update"            ON public.media;
DROP POLICY IF EXISTS "media public delete"            ON public.media;
-- Kept: "Public read produce", "harvests public read", "Public read media".

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.produce_listings, public.harvests, public.media
  FROM anon, authenticated;

-- Stock counters run with the caller's rights; only the server calls them.
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric),
                           public.increment_stock(uuid, numeric),
                           public.decrement_harvest_stock(uuid, numeric),
                           public.increment_harvest_stock(uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric),
                          public.increment_stock(uuid, numeric),
                          public.decrement_harvest_stock(uuid, numeric),
                          public.increment_harvest_stock(uuid, numeric)
  TO service_role;

-- ── 2. Farmers: no public writes; private details hidden ────────────────
DROP POLICY IF EXISTS "Allow update farmers" ON public.farmers;
-- Revoking UPDATE on the table also drops every column-level UPDATE grant
-- (including story_quote_te from telugu-how-we-grow-migration.sql).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.farmers FROM anon, authenticated;
-- Same list as FARMER_HIDDEN_COLUMNS in src/lib/farmerColumns.ts.
REVOKE SELECT (phone, farm_address, lat, lng, pickup_location_phones, upi_id, upi_qr_code_url)
  ON public.farmers FROM anon, authenticated;
-- Kept: "Public read farmers" + the column SELECT grants for public profile
-- fields (name, village, district, photos, method, pickup points …).

-- ── 3. Aggregators' growers: name + village only ────────────────────────
-- ("Grown by" on a produce page shows the grower's name and village.)
REVOKE ALL ON public.source_farmers FROM anon, authenticated;
GRANT SELECT (id, aggregator_id, name, village, created_at, updated_at)
  ON public.source_farmers TO anon, authenticated;

-- ── 4. Buyers' demand requests: server only ─────────────────────────────
-- /api/consumer/intents (the buyer's own, from the login cookie),
-- /api/farmer/demand-requests (logged-in sellers in that region),
-- /api/demand-supply and moderator screens — all service role.
DROP POLICY IF EXISTS "public read demand_intents"   ON public.demand_intents;
DROP POLICY IF EXISTS "public insert demand_intents" ON public.demand_intents;
DROP POLICY IF EXISTS "public update demand_intents" ON public.demand_intents;
DROP POLICY IF EXISTS "public delete demand_intents" ON public.demand_intents;
REVOKE ALL ON public.demand_intents FROM anon, authenticated;

-- ── 5. "Notify me" requests: the public may add one, nothing else ───────
-- (No read policy ever existed; this only tidies the extra grants.)
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.notify_requests FROM anon, authenticated;

-- ── 6. Photo storage (farm-images) ──────────────────────────────────────
-- Uploads now use a one-time signed link from /api/uploads/farm-image for
-- one path inside the caller's own folder. Photo links keep working — the
-- bucket stays public, and public links never check these policies.
DROP POLICY IF EXISTS "farm-images public upload" ON storage.objects;
DROP POLICY IF EXISTS "farm-images public update" ON storage.objects;
DROP POLICY IF EXISTS "farm-images public delete" ON storage.objects;
-- The read policy only allowed LISTING every file in the bucket; nothing in
-- the app lists files, and photo links do not need it.
DROP POLICY IF EXISTS "farm-images public read"   ON storage.objects;

UPDATE storage.buckets
   SET file_size_limit = 8388608,  -- 8 MB = MAX_UPLOAD_BYTES in src/lib/sellerWriteRules.ts
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 WHERE id = 'farm-images';

COMMIT;
