-- ============================================================================
-- Close the anon-role exposure on `orders` and `reviews`.
--
-- CONTEXT
-- The Supabase anon key ships inside every JS bundle, so whatever the `anon`
-- role can SELECT is world-readable and whatever it can UPDATE is
-- world-writable. Before this migration, `orders` carried USING(true) policies
-- for SELECT/INSERT/UPDATE granted to `public`, plus table-wide grants. An
-- unauthenticated visitor could:
--
--   * SELECT every order — buyer_name, buyer_phone, buyer_email,
--     delivery_address, delivery_landmark, delivery_pincode, delivery_alt_phone
--     and handover_otp (the code that authorises physical handover of goods).
--   * UPDATE any order — e.g. SET payment_status='completed', bypassing the
--     server-side Razorpay signature verification entirely.
--   * UPDATE total_price / platform_fee / refund_amount.
--   * INSERT reviews directly, skipping every rate limit in /api/reviews and
--     setting approved=true on the way in.
--
-- WHY A FULL REVOKE IS POSSIBLE NOW
-- Row-scoping ("a farmer sees only their own orders") cannot be expressed in
-- RLS here: the browser does not authenticate to Postgres, so there is no
-- auth.uid() to key a policy on — identity lives in an app-signed HMAC cookie
-- the database knows nothing about.
--
-- So the browser stopped talking to `orders` at all. Every read and write now
-- goes through an API route that verifies that cookie and queries with the
-- service role:
--
--   GET  /api/farmer/orders            (list + dashboard, scoped by session)
--   GET  /api/farmer/orders/[id]       (detail, scoped by session)
--   POST /api/farmer/orders/[id]/approve
--   POST /api/farmer/orders/[id]/schedule
--   POST /api/farmer/orders/[id]/payment-status
--   POST /api/consumer/orders/payment-claimed   (session OR guest token)
--   POST /api/consumer/orders/switch-to-cod     (session OR guest token)
--   ... alongside the existing decline / ship / deliver / confirm-pickup routes.
--
-- BEFORE RUNNING THIS, the app code above must be deployed. Running it against
-- an older deployment breaks the farmer dashboard and the cart.
--
-- REALTIME: the farmer and consumer order screens used to hold
-- postgres_changes subscriptions on `orders`. Realtime is filtered by the
-- subscriber's own permissions, so after this revoke they would have gone
-- silent — with no error on the channel. They were replaced with polling on the
-- authenticated endpoints (src/lib/useOrderPolling.ts) in the same change.
--
-- Idempotent. Safe to run more than once. Run on STAGING first, then prod.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PART A — remove anon write paths with no legitimate caller
--
-- Farmer registration goes through /api/auth/register on the service role, so
-- the anon INSERT policy on farmers has no caller and only widens the surface.
-- (Mirrors farmers-column-lockdown.sql; repeated so this file stands alone.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert farmers" ON public.farmers;


-- ---------------------------------------------------------------------------
-- PART B — orders: revoke everything from the browser roles
--
-- No policy is left permitting anon access, and no grant backs one. Both are
-- dropped: a policy without a grant (or a grant without a policy) still fails
-- closed, but leaving either behind invites someone to "restore" the other and
-- silently reopen this.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated insert orders" ON public.orders;
DROP POLICY IF EXISTS "public read orders"          ON public.orders;
DROP POLICY IF EXISTS "public_insert"               ON public.orders;
DROP POLICY IF EXISTS "public_select"               ON public.orders;
DROP POLICY IF EXISTS "public_update"               ON public.orders;

REVOKE ALL ON public.orders FROM anon, authenticated;

-- RLS stays enabled so the table is closed by default to any role that is
-- granted access later without a matching policy.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- PART C — reviews: public may READ approved reviews, and nothing else
--
-- "public_select_reviews" USING(true) sat beside "Public read reviews"
-- USING(approved = true). Policies are OR'd, so the permissive one won and
-- unapproved / moderated-out reviews were publicly readable. Dropping it makes
-- the approved-only policy the one actually in force.
--
-- Writes go through /api/reviews on the service role, which enforces
-- 5-per-phone-per-day, 20-per-IP-per-day and one-review-per-farmer-per-phone.
-- A direct anon INSERT skipped all of it and could set approved = true.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_select_reviews" ON public.reviews;
DROP POLICY IF EXISTS "public_insert_reviews" ON public.reviews;

REVOKE ALL ON public.reviews FROM anon, authenticated;

-- reviewer_phone is PII and is only needed server-side for the duplicate check,
-- so it is deliberately excluded from this list.
GRANT SELECT (
  id, farmer_id, produce_listing_id, reviewer_name, reviewer_location,
  star_rating, review_text, produce_ordered, created_at, approved
) ON public.reviews TO anon, authenticated;

-- The app must ask for these columns explicitly. `select('*')` expands to every
-- column at parse time and fails the whole query with 42501 under column-level
-- grants — see src/app/farmer/[slug]/page.tsx, which lists them.


-- ---------------------------------------------------------------------------
-- VERIFY — every one of these must return false.
-- ---------------------------------------------------------------------------
SELECT
  has_table_privilege ('anon', 'public.orders',                        'SELECT') AS anon_reads_orders,
  has_table_privilege ('anon', 'public.orders',                        'UPDATE') AS anon_writes_orders,
  has_table_privilege ('anon', 'public.orders',                        'INSERT') AS anon_inserts_orders,
  has_column_privilege('anon', 'public.orders',  'handover_otp',       'SELECT') AS anon_reads_handover_otp,
  has_column_privilege('anon', 'public.reviews', 'reviewer_phone',     'SELECT') AS anon_reads_reviewer_phone,
  has_table_privilege ('anon', 'public.reviews',                       'INSERT') AS anon_inserts_reviews,
  has_column_privilege('anon', 'public.farmers', 'password_hash',      'SELECT') AS anon_reads_password_hash,
  has_column_privilege('anon', 'public.farmers', 'bank_account_number','SELECT') AS anon_reads_bank_account;

-- Expect: zero rows for orders, exactly one SELECT policy on reviews
-- ("Public read reviews", approved = true).
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('orders', 'reviews')
ORDER BY tablename, cmd, policyname;
