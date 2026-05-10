-- ================================================================
-- YFF — Consumer authentication
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

-- 1. Consumer accounts table
CREATE TABLE IF NOT EXISTS consumers_auth (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text,
  phone          varchar(15)  UNIQUE NOT NULL,
  password_hash  text         NOT NULL,
  created_at     timestamptz  DEFAULT now(),
  last_login_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_consumers_auth_phone ON consumers_auth(phone);

-- 2. RLS — only the service-role key (used in /api/consumer/* handlers) can
-- read or write. The anon key used by the browser cannot touch this table.
ALTER TABLE consumers_auth ENABLE ROW LEVEL SECURITY;

-- No policies = no anon access. Service role bypasses RLS automatically.

-- 3. Sanity check helper for ops debugging
COMMENT ON TABLE consumers_auth IS
  'Consumer accounts. Server-only access via service role; passwords scrypt-hashed.';
