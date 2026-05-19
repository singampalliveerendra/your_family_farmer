-- ============================================================
--  RLS LOCKDOWN MIGRATION  (phased)
-- ============================================================
--  The browser holds the public Supabase ANON key. Without RLS,
--  anyone can read/write every table directly via the REST API.
--  This migration removes anon access table by table, in step
--  with the code refactor that moves each query to a server route
--  using the SERVICE_ROLE key (which bypasses RLS).
-- ============================================================


-- ------------------------------------------------------------
--  PHASE 1 — orders   ✅ READY TO RUN
-- ------------------------------------------------------------
--  Ship the branch `security/rls-orders-lockdown` FIRST, then run
--  this block. By then every order read/write has moved to a
--  session-gated server route, so no anon policy is needed —
--  RLS-enabled with no policy = anon is fully denied.
--
--  This is the launch-blocker fix for payments: it stops anyone
--  from marking orders paid or reading buyer phones/addresses.

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- (intentionally no anon/authenticated policies => deny-all for anon)


-- ------------------------------------------------------------
--  PHASE 2 — farmers / produce / media / etc.   ⚠️ DO NOT RUN YET
-- ------------------------------------------------------------
--  These tables are still read AND written from the browser
--  (farmer dashboard profile edits, produce create/delete, photo
--  uploads, demand intents). Running this block before that
--  refactor lands will break the farmer dashboard. Apply only
--  after Phase 2 of the refactor.

-- -- farmers: public may read active profiles only ---------------
-- ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon read active farmers" ON farmers;
-- CREATE POLICY "anon read active farmers" ON farmers
--   FOR SELECT TO anon USING (active = true);

-- -- produce_listings: public may read, not write ----------------
-- ALTER TABLE produce_listings ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon read produce" ON produce_listings;
-- CREATE POLICY "anon read produce" ON produce_listings
--   FOR SELECT TO anon USING (true);

-- -- media: public may read --------------------------------------
-- ALTER TABLE media ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon read media" ON media;
-- CREATE POLICY "anon read media" ON media
--   FOR SELECT TO anon USING (true);

-- -- reviews: public may read approved reviews only --------------
-- ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon read approved reviews" ON reviews;
-- CREATE POLICY "anon read approved reviews" ON reviews
--   FOR SELECT TO anon USING (approved = true);

-- -- regions: public may read active regions ---------------------
-- ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon read active regions" ON regions;
-- CREATE POLICY "anon read active regions" ON regions
--   FOR SELECT TO anon USING (active = true);

-- -- demand_intents: public may insert, not read -----------------
-- ALTER TABLE demand_intents ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon insert demand_intents" ON demand_intents;
-- CREATE POLICY "anon insert demand_intents" ON demand_intents
--   FOR INSERT TO anon WITH CHECK (true);

-- -- notify_requests: public may insert, not read ----------------
-- ALTER TABLE notify_requests ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "anon insert notify_requests" ON notify_requests;
-- CREATE POLICY "anon insert notify_requests" ON notify_requests
--   FOR INSERT TO anon WITH CHECK (true);

-- consumers_auth and delivery_boys already have RLS enabled with no
-- anon policies (deny-all) — leave them as-is.
-- ============================================================
