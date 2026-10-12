-- Consumer saved delivery address (src/lib/savedAddress.ts).
--
-- One address per buyer account, so a returning buyer doesn't retype it on
-- every order. The cart pre-selects it for home delivery; "Send to a different
-- address" is a one-off and never overwrites it. Edited on /consumer/profile.
--
-- Each order still stores its OWN copy of the address (orders.delivery_*), so
-- editing this later never changes an order already placed.
--
-- consumers_auth is already service-role only (RLS on, no policies); these
-- columns are read/written only by /api/consumer/profile after a session check.
-- Idempotent — safe to run twice.
--
-- Until this runs in an environment, the profile page shows "Could not load
-- your address" and the cart falls back to the plain address form.

ALTER TABLE public.consumers_auth
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_landmark text,
  ADD COLUMN IF NOT EXISTS address_pincode text,
  ADD COLUMN IF NOT EXISTS address_alt_phone text,
  ADD COLUMN IF NOT EXISTS address_updated_at timestamptz;
