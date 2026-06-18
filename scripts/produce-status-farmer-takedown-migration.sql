-- ============================================================
-- Extend produce_listings.status CHECK to allow farmer take-downs
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================
-- The farmer dashboard's Pause and Suspend buttons write the statuses
-- 'paused' and 'suspended_by_farmer', but the existing
-- produce_listings_status_check constraint rejected them (error 23514),
-- so the take-downs silently never persisted and consumers could still
-- see and order the produce. This recreates the constraint with the full
-- set of statuses the app actually uses.

ALTER TABLE produce_listings
  DROP CONSTRAINT IF EXISTS produce_listings_status_check;

ALTER TABLE produce_listings
  ADD CONSTRAINT produce_listings_status_check
  CHECK (status IN (
    'available',
    'coming_soon',
    'sold_out',
    'pending_review',
    'rejected',
    'suspended',           -- moderator take-down
    'suspended_by_farmer', -- farmer Suspend button
    'paused'               -- farmer Pause button
  ));
