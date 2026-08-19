-- ================================================================
-- YFF — App install counter (the "N downloads" figure on /home)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- One row per DEVICE that actually installed the PWA, not per tap
-- of the Download button. The device mints a random id into its own
-- localStorage the first time it reports, and that id is UNIQUE
-- here, so a reinstall or a second report from the same device
-- cannot inflate the number.
--
-- Writes go through the service-role API (/api/installs). Nothing
-- reads this table from the browser — the landing page renders the
-- count on the server — so there are no policies at all: RLS is on
-- and only the service role gets through.
-- ================================================================

CREATE TABLE IF NOT EXISTS app_installs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  text NOT NULL UNIQUE,        -- random, client-minted; not a fingerprint
  role       text,                        -- 'consumer' | 'seller' | NULL (unknown)
  platform   text,                        -- coarse: 'android' | 'ios' | 'desktop'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "installs this week" style questions, and the count itself.
CREATE INDEX IF NOT EXISTS idx_app_installs_created ON app_installs(created_at DESC);

ALTER TABLE app_installs ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service role only.

-- Sanity check
SELECT COUNT(*) AS installs FROM app_installs;
