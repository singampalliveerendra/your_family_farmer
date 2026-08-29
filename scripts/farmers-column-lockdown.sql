-- ============================================================================
-- farmers: column-level lockdown for the anon (browser) role
--
-- WHY
-- The anon key ships inside every JS bundle, so whatever the `anon` role can
-- SELECT is world-readable and whatever it can UPDATE is world-writable. The
-- `farmers` table had blanket table grants plus RLS policies of the form
--   "Public read farmers"  FOR SELECT TO public USING (true)
--   "Allow update farmers" FOR UPDATE TO anon   USING (true) WITH CHECK (true)
-- which meant any visitor could, from the browser console:
--   * read password_hash for every farmer (offline scrypt cracking)
--   * read bank_account_number / bank_ifsc / activation_code
--   * UPDATE farmers SET password_hash = <known hash>  -> account takeover
--   * UPDATE farmers SET bank_account_number = <theirs> -> payout redirect
--
-- An RLS policy cannot restrict *columns* — USING/WITH CHECK filter rows only.
-- Column-level GRANTs are the mechanism Postgres provides for this, and they
-- compose with RLS: a query must satisfy both. So we revoke the blanket grants
-- and hand back exactly the columns the browser legitimately needs.
--
-- Row-scoping ("a farmer may only update their OWN row") is deliberately NOT
-- solved here — these policies still allow cross-row writes. That needs the
-- profile save moved behind an authenticated API route; this migration removes
-- the credential/payout exposure today without waiting for that refactor.
--
-- The app keeps its column lists in sync via src/lib/farmerColumns.ts.
-- Adding a farmers column? Add it to BOTH if it is safe to publish, NEITHER if
-- it is a secret.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Service-role keeps full access (it bypasses RLS and holds its own grants);
-- this only ever touches the two browser-reachable roles.
REVOKE ALL ON public.farmers FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELECT: public profile columns only.
-- Excluded on purpose: password_hash, bank_account_number, bank_ifsc,
-- activation_code.
-- ---------------------------------------------------------------------------
GRANT SELECT (
  id, slug, name, village, district, state, phone, method,
  farm_size_acres, farming_since_year, story_quote, soil_organic_carbon,
  soil_ph, brix_reading, water_source, delivery_available,
  pickup_available, farm_visit_day, rating_avg, rating_count,
  buyer_count, region_slug, active, created_at, pickup_locations,
  cover_photo_url, photo_url, pesticide_cert_url, pickup_slots,
  lat, lng, location_name, upi_id, upi_qr_code_url, cod_enabled,
  farm_address, registered_by_moderator, facebook_url, instagram_url,
  youtube_url, pickup_location_phones, account_type, contact_person,
  how_we_aggregate, business_cert_url, organic_certificate_url,
  terms_accepted_at, approval_status
) ON public.farmers TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- UPDATE: exactly the fields the farmer dashboard's profile form writes
-- (src/app/farmer/dashboard/page.tsx). Everything else is server-only.
--
-- Beyond the credential/payout columns this also blocks a farmer (or anyone
-- with the anon key) from self-approving via approval_status, self-activating
-- via active, or inflating rating_avg / rating_count / buyer_count.
-- ---------------------------------------------------------------------------
GRANT UPDATE (
  name, village, district, method, slug, pickup_locations, farm_address,
  cover_photo_url, photo_url, pesticide_cert_url, upi_id, upi_qr_code_url,
  cod_enabled, contact_person, how_we_aggregate, business_cert_url,
  organic_certificate_url, pickup_slots, pickup_location_phones,
  lat, lng, location_name, phone, farm_size_acres, soil_organic_carbon,
  water_source, story_quote, farming_since_year, soil_ph,
  facebook_url, instagram_url, youtube_url
) ON public.farmers TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- No INSERT / DELETE / TRUNCATE for the browser.
-- Farmer registration runs through /api/auth/register on the service-role key,
-- so this policy had no caller — it only widened the attack surface.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert farmers" ON public.farmers;
