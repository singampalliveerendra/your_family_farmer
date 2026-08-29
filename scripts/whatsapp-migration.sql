-- WhatsApp OTP + order-status notifications.
--
-- Two changes:
--   1. otp_sessions moves from 2factor.in session ids to codes we mint and
--      hash ourselves (Meta only delivers a template, it does not generate or
--      verify OTPs the way 2factor's AUTOGEN endpoint did).
--   2. A `notifications` outbox so order-status WhatsApps survive a Meta
--      outage and can be retried by the cron.
--
-- Safe to re-run. Apply to STAGING first, then prod.

-- ---------------------------------------------------------------------------
-- 1. otp_sessions: store a hash of our own code
-- ---------------------------------------------------------------------------

-- HMAC of the OTP (see src/lib/otp.ts). The plaintext code is never stored.
ALTER TABLE otp_sessions ADD COLUMN IF NOT EXISTS code_hash text;

-- Wrong guesses against this code. src/app/api/otp/verify burns the row at 5.
ALTER TABLE otp_sessions ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- session_id held the 2factor session and is no longer written. Kept (nullable)
-- rather than dropped so this migration is trivially reversible; rows are
-- housekept after 24h, so it empties itself.
ALTER TABLE otp_sessions ALTER COLUMN session_id DROP NOT NULL;

COMMENT ON COLUMN otp_sessions.session_id IS
  'Legacy 2factor.in session id. Unused since the WhatsApp OTP migration.';

-- ---------------------------------------------------------------------------
-- 2. notifications outbox
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(15) NOT NULL,              -- 10-digit; country code added at send
  template text NOT NULL,                  -- approved WhatsApp Manager template name
  event text NOT NULL,                     -- order_placed | order_shipped | ...
  lang text NOT NULL DEFAULT 'en',         -- 'en' | 'te'
  body_params jsonb,                       -- ordered {{1}}, {{2}}, ... values
  url_button_param text,                   -- appended to the tracking-link button
  order_id uuid,                           -- nullable: OTPs aren't order-scoped
  dedupe_key text NOT NULL,                -- one message per event per group
  status text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  wa_message_id text,                      -- Meta message id, for delivery receipts
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- The de-duplication guarantee: a double tap, a retry, or a rider job spanning
-- several order rows all collapse to one message. src/lib/notify.ts relies on
-- the 23505 unique violation this raises.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications (dedupe_key);

-- Drives the cron's "what is still stuck" query.
CREATE INDEX IF NOT EXISTS idx_notifications_pending
  ON notifications (status, created_at)
  WHERE status = 'pending';

-- Delivery receipts arrive from Meta keyed on the message id.
CREATE INDEX IF NOT EXISTS idx_notifications_wa_message_id
  ON notifications (wa_message_id);

-- All access is via the service-role key in API routes, so lock the table to
-- everyone else (same posture as otp_sessions).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
