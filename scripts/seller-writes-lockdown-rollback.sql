-- ================================================================
-- UNDO scripts/seller-writes-lockdown.sql — EMERGENCY ONLY.
-- This re-opens every hole that script closed (anyone could again edit any
-- farmer's produce, profile and photos, and read phones and demand requests).
-- Use it only if the lockdown broke something live and the code fix cannot
-- ship quickly; then run the lockdown again as soon as it does.
-- ================================================================

BEGIN;

-- 1. Produce, harvests, gallery
GRANT INSERT, UPDATE, DELETE ON public.produce_listings, public.harvests, public.media TO anon, authenticated;
CREATE POLICY "Allow insert produce"           ON public.produce_listings FOR INSERT TO anon   WITH CHECK (true);
CREATE POLICY "produce_listings public update" ON public.produce_listings FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "produce_listings public delete" ON public.produce_listings FOR DELETE TO public USING (true);
CREATE POLICY "harvests public insert"         ON public.harvests         FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "harvests public update"         ON public.harvests         FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "harvests public delete"         ON public.harvests         FOR DELETE TO public USING (true);
CREATE POLICY "Allow insert media"             ON public.media            FOR INSERT TO anon   WITH CHECK (true);
CREATE POLICY "media public update"            ON public.media            FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "media public delete"            ON public.media            FOR DELETE TO public USING (true);
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric), public.increment_stock(uuid, numeric),
                          public.decrement_harvest_stock(uuid, numeric), public.increment_harvest_stock(uuid, numeric)
  TO anon, authenticated;

-- 2. Farmers (the column lists from scripts/farmers-column-lockdown.sql)
GRANT SELECT (phone, farm_address, lat, lng, pickup_location_phones, upi_id, upi_qr_code_url)
  ON public.farmers TO anon, authenticated;
GRANT UPDATE (
  name, village, district, method, slug, pickup_locations, farm_address,
  cover_photo_url, photo_url, pesticide_cert_url, upi_id, upi_qr_code_url,
  cod_enabled, contact_person, how_we_aggregate, business_cert_url,
  organic_certificate_url, pickup_slots, pickup_location_phones,
  lat, lng, location_name, phone, farm_size_acres, soil_organic_carbon,
  water_source, story_quote, farming_since_year, soil_ph,
  facebook_url, instagram_url, youtube_url
) ON public.farmers TO anon, authenticated;
CREATE POLICY "Allow update farmers" ON public.farmers FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 3. Growers
GRANT SELECT ON public.source_farmers TO anon, authenticated;

-- 4. Demand requests
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_intents TO anon, authenticated;
CREATE POLICY "public read demand_intents"   ON public.demand_intents FOR SELECT TO public USING (true);
CREATE POLICY "public insert demand_intents" ON public.demand_intents FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public update demand_intents" ON public.demand_intents FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "public delete demand_intents" ON public.demand_intents FOR DELETE TO public USING (true);

-- 5. notify_requests: nothing to restore (insert-only before and after).

-- 6. Storage
CREATE POLICY "farm-images public read"   ON storage.objects FOR SELECT USING (bucket_id = 'farm-images');
CREATE POLICY "farm-images public upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'farm-images');
CREATE POLICY "farm-images public update" ON storage.objects FOR UPDATE USING (bucket_id = 'farm-images');
CREATE POLICY "farm-images public delete" ON storage.objects FOR DELETE USING (bucket_id = 'farm-images');
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'farm-images';

COMMIT;
