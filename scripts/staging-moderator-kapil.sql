-- ================================================================
-- YFF — Staging moderator account for Kapil (client testing)
-- Run in: STAGING Supabase (egaquepinrgzzyfazppr)
--         Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (re-running resets the password to the same value).
--
-- DO NOT run this against production.
--
-- Login: /moderator/login → phone + password.
--   phone    : 7893074271   (10 digits, no +91)
--   password : NOT recorded here on purpose — it was handed to Kapil directly.
--
-- Never write a plaintext password into this repo. The hash below is safe to
-- store (scrypt is one-way, so it cannot be turned back into the password);
-- a comment spelling the password out is not, and git history keeps it forever
-- even after the line is deleted.
--
-- The hash below is scrypt "salt_hex:hash_hex" (see src/lib/password.ts).
-- To set a different password, generate a new hash and swap it in:
--   node -e "const{scryptSync,randomBytes}=require('crypto');const s=randomBytes(16).toString('hex');console.log(s+':'+scryptSync(process.argv[1],s,64).toString('hex'))" 'NEW_PASSWORD'
--
-- region_slug = 'tadepalligudem' because every seeded staging farmer,
-- order and price row lives in that region — the panel filters all of
-- its lists by the moderator's own region, so this is the widest view
-- available. There is no global/all-region moderator role in the code.
-- ================================================================

INSERT INTO moderators (name, phone, password_hash, region_slug, active)
VALUES (
  'Kapil',
  '7893074271',
  'd28127cb164d63a20ee5a90d60c632fa:5b35ca760cb0244eb41cfcb31d67bfcfd0ef31028dcd9eb592f4bad41146a33e6a7e7e12fc905336f5c3b867d654cdfb4c0275cd98e1bb05ab37deca33e05e1d',
  'tadepalligudem',
  true
)
ON CONFLICT (phone) DO UPDATE
  SET name          = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      region_slug   = EXCLUDED.region_slug,
      active        = true;

-- Verify (password_hash intentionally not selected):
SELECT id, name, phone, region_slug, active, created_at
FROM moderators
ORDER BY created_at;
