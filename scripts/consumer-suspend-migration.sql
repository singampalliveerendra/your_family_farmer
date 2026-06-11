-- ================================================================
-- YFF — Consumer suspension
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Lets a moderator deactivate/suspend a consumer account (e.g. repeated
-- fake orders or abuse). A suspended consumer cannot log in, and any
-- existing session is rejected on the next request.
-- ================================================================

ALTER TABLE consumers_auth
  ADD COLUMN IF NOT EXISTS suspended    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
