-- ================================================================
-- YFF — Moderator login (phone + password)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Replaces the single shared MODERATOR_PASSWORD env var with per-person
-- accounts, the same shape as farmer login: phone + scrypt-hashed password.
-- A moderator can only sign in to the zone in their region_slug (the login
-- route checks it against MODERATOR_ZONE).
-- ================================================================

CREATE TABLE IF NOT EXISTS moderators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(100),
  phone         varchar(15) NOT NULL UNIQUE,
  password_hash text NOT NULL,            -- scrypt "salt_hex:hash_hex" (see src/lib/password.ts)
  region_slug   varchar(60) NOT NULL,
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- Service-role only: RLS on, no policies (anon key cannot read/write).
ALTER TABLE moderators ENABLE ROW LEVEL SECURITY;

-- Seeding a moderator: hashes can't be made in SQL. Generate one with Node and
-- insert it. From the project root:
--
--   node -e "const{scryptSync,randomBytes}=require('crypto');const s=randomBytes(16).toString('hex');console.log(s+':'+scryptSync(process.argv[1],s,64).toString('hex'))" 'YOUR_PASSWORD'
--
-- then:
--
--   INSERT INTO moderators (name, phone, password_hash, region_slug)
--   VALUES ('Name', '9XXXXXXXXX', '<hash from above>', 'tadepalligudem')
--   ON CONFLICT (phone) DO UPDATE SET password_hash = EXCLUDED.password_hash;
