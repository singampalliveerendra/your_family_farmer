-- Settings → Default dashboard (src/lib/defaultDashboard.ts).
--
-- Which surface `/` opens on for a signed-in person. Keyed by the normalised
-- 10-digit PHONE, not an account id: farmers and consumers_auth are separate
-- tables, and the phone is the only thing that ties one person across them.
--
-- Service-role only. RLS on with no policies, and no grants to anon or
-- authenticated: every read and write goes through
-- /api/settings/default-dashboard or `/`, both of which verify a session
-- cookie first. Idempotent — safe to run twice.
--
-- Until this runs in an environment, `/` degrades to its old behaviour and the
-- Settings control shows "Could not load your setting."

CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
  phone text PRIMARY KEY CHECK (phone ~ '^[0-9]{10}$'),
  default_dashboard text NOT NULL CHECK (default_dashboard IN ('farmer', 'consumer')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_preferences FROM anon, authenticated;
