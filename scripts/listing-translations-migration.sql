-- ================================================================
-- YFF: English + Telugu copies of what farmers type for a produce
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================
--
-- One jsonb column. Shape (src/lib/textTranslations.ts):
--   { "name":        { "of": "కందిపప్పు", "en": "Toor dal", "te": "కందిపప్పు" },
--     "variety":     { ... }, "description": { ... }, "how_we_grow": { ... } }
-- "of" is the text that was translated; a copy is used only while it still
-- matches the produce's text, so editing a text needs no clean-up here.
--
-- Filled by the server (src/lib/listingTranslate.ts, Gemini free tier) after a
-- save, and for older produce a few at a time after the public feed is served.
-- NULL = nothing translated yet; buyers then see the text as typed.
--
-- Safe to run before or after the code deploys: the code skips the column
-- when it is missing. Idempotent: safe to run more than once.
--
-- No grant needed: produce_listings is readable as a whole table, and only the
-- server (service role) writes it since scripts/seller-writes-lockdown.sql.

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS translations jsonb;

NOTIFY pgrst, 'reload schema';
