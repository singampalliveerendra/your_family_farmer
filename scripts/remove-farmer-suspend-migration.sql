-- ============================================================
-- Remove the farmer "Suspend" take-down, keeping "Pause"
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- Idempotent — safe to re-run.
-- ============================================================
-- The farmer dashboard had two buttons that did the same thing: Pause
-- ('paused') and Suspend ('suspended_by_farmer'). Both hid the listing from
-- buyers and both were reversed by Resume. Suspend was removed — the word
-- already means a *moderator* take-down ('suspended') elsewhere in the app.
--
-- Any listing left in 'suspended_by_farmer' would have no button to bring it
-- back once the code ships, so fold those rows into 'paused'. Resume then
-- works on them exactly as before.
--
-- ORDER MATTERS: run this AFTER the code deploy, not before. The old code
-- still writes 'suspended_by_farmer', so a row could land in that status
-- between this UPDATE and the deploy.

UPDATE produce_listings
   SET status = 'paused'
 WHERE status = 'suspended_by_farmer';

-- The status CHECK constraint is deliberately left alone: it still permits
-- 'suspended_by_farmer'. Tightening it would reject writes from any old client
-- still running the previous bundle (error 23514, the same failure
-- produce-status-farmer-takedown-migration.sql was written to fix). An allowed
-- value that nothing writes any more is harmless; drop it from the constraint
-- later if you want, once every client has the new code.

-- Verify: expect zero rows.
-- SELECT id, name, status FROM produce_listings WHERE status = 'suspended_by_farmer';
