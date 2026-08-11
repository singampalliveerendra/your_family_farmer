-- ================================================================
-- YFF — Phone number per pickup location
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Pickup points are often NOT the farm — they are a shop or a landmark that
-- the farmer has an arrangement with ("Vijayalakshmi departmental stores,
-- near EVM High School"). The buyer heading there needs a number to call for
-- that specific point, which is not the farmer's own phone.
--
-- Stored as a jsonb map keyed by the location name, exactly like
-- farmers.pickup_slots:  { "<pickup location>": "9876543210" }
-- Keying by name (rather than a parallel array) means a farmer can reorder or
-- delete locations without silently shifting phone numbers onto the wrong one.
--
-- orders.pickup_location_phone is the snapshot taken when the order is placed,
-- so a later edit to the farmer's map never rewrites the number the buyer was
-- actually given.
-- ================================================================

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS pickup_location_phones jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN farmers.pickup_location_phones IS
  'Optional contact number per pickup location: { "<location name>": "<10-digit phone>" }. Keyed by the name in pickup_locations. Buyer-facing — whom to call AT that pickup point.';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_location_phone text;

COMMENT ON COLUMN orders.pickup_location_phone IS
  'Snapshot of the pickup point''s contact number at the time the order was placed, resolved from farmers.pickup_location_phones. Distinct from pickup_phone, which is the buyer-supplied number of whoever collects.';
