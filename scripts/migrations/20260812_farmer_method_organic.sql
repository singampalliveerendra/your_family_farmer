-- ================================================================
-- YFF — allow method = 'organic' on farmers
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Fixes: "new row for relation "farmers" violates check constraint
--         "farmers_method_check""
--
-- farmers_method_check was written when the only methods were natural /
-- low_chemical / chemical. Two things added later write 'organic' and are
-- therefore hard-broken against it:
--
--   1. api/aggregator/register — forces method = 'organic' for every
--      aggregator (the spec limits aggregators to organic produce), so
--      aggregator signup fails 100% of the time, on every environment.
--   2. ModeratorFarmerForm — offers "Organic (certified)" in the method
--      dropdown, so a moderator picking it cannot create or edit that farmer.
--
-- 'organic' is a genuinely distinct claim from 'natural' (certified vs simply
-- no chemicals), and both surfaces deliberately treat it that way — so the
-- constraint is what is stale, not the code. Widen it rather than downgrading
-- aggregators to 'natural'.
--
-- low_chemical and chemical are kept: existing rows may still use them.
-- ================================================================

ALTER TABLE farmers DROP CONSTRAINT IF EXISTS farmers_method_check;

ALTER TABLE farmers ADD CONSTRAINT farmers_method_check
  CHECK (method IN ('natural', 'organic', 'low_chemical', 'chemical'));

COMMENT ON COLUMN farmers.method IS
  'How the produce is grown: natural (no chemicals), organic (certified), low_chemical, chemical. Aggregators are always ''organic'' — set at registration, not user-editable.';
