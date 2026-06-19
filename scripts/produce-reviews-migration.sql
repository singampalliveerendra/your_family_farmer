-- ================================================================
-- YFF — Per-produce buyer reviews (Swiggy/Zomato style)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- A consumer who ordered a produce can leave ONE review on it, but only
-- after that order is delivered / picked up (verified buyer). Other buyers
-- see the rating + reviews on the produce card while browsing.
--
-- This is separate from the existing farmer-level `reviews` table — those
-- stay as-is and rate the farmer; these rate an individual produce listing.
-- ================================================================

CREATE TABLE IF NOT EXISTS produce_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL,
  produce_listing_id uuid NOT NULL,
  farmer_id          uuid,
  consumer_id        uuid,
  reviewer_name      text NOT NULL,
  reviewer_phone     text,
  star_rating        int  NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  review_text        text,
  approved           boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- One review per order — each order row is a single produce line, so this
-- also enforces "one review per produce per order".
CREATE UNIQUE INDEX IF NOT EXISTS uq_produce_reviews_order
  ON produce_reviews(order_id);

-- Fast lookups when rendering a listing's reviews.
CREATE INDEX IF NOT EXISTS idx_produce_reviews_listing
  ON produce_reviews(produce_listing_id, approved);

-- Cache the aggregate on the listing so the browse grid needs no extra query.
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS rating_avg   numeric(2,1),
  ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0;

-- RLS: anyone may read approved reviews (shown publicly on produce cards).
-- All writes go through the service-role API route, which bypasses RLS, so no
-- INSERT/UPDATE policy is granted to anon.
ALTER TABLE produce_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produce_reviews public read" ON produce_reviews;
CREATE POLICY "produce_reviews public read"
  ON produce_reviews FOR SELECT
  USING (approved = true);
