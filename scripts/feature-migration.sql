-- ================================================================
-- YFF Feature Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

-- 1. Harvest date on produce listings
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS harvest_date date;

-- 2. Cover photo for farmer profile banner
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS cover_photo_url text;

-- 3. Farmer avatar/profile photo
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS photo_url text;

-- 4. Pesticide test certificate (photo URL)
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS pesticide_cert_url text;

-- 5. Pickup schedule: {days: string[], time_from: string, time_to: string}
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS pickup_slots jsonb;

-- 6. OTP table for secure farmer login
CREATE TABLE IF NOT EXISTS farmer_otps (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text        NOT NULL,
  otp         text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean     DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farmer_otps_phone   ON farmer_otps(phone);
CREATE INDEX IF NOT EXISTS idx_farmer_otps_expires ON farmer_otps(expires_at);

-- RLS: only service-role key (used in API routes) can access
ALTER TABLE farmer_otps ENABLE ROW LEVEL SECURITY;

-- 7. Payment method and status on orders (COD support)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';

-- 8. Farmer GPS location for distance-based discovery
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS lat numeric(10,7);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS lng numeric(10,7);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_name text;

-- 9. Password hash for farmer login
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS password_hash text;

-- 10. Farm gallery photos
CREATE TABLE IF NOT EXISTS media (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id   uuid        REFERENCES farmers(id) ON DELETE CASCADE,
  type        text        NOT NULL DEFAULT 'photo',
  url         text        NOT NULL,
  caption     text,
  sort_order  integer     DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_farmer_id ON media(farmer_id);
CREATE INDEX IF NOT EXISTS idx_media_type      ON media(type);

-- 11. Reviewer phone for duplicate-review prevention
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_phone text;
CREATE INDEX IF NOT EXISTS idx_reviews_farmer_phone ON reviews(farmer_id, reviewer_phone);

-- 12. WhatsApp click analytics (insert-only, no auth needed)
CREATE TABLE IF NOT EXISTS wa_clicks (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id  uuid        REFERENCES farmers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_clicks_farmer ON wa_clicks(farmer_id);

-- Allow anonymous inserts for wa_clicks (consumer clicks)
ALTER TABLE wa_clicks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wa_clicks' AND policyname = 'anon insert wa_clicks'
  ) THEN
    EXECUTE 'CREATE POLICY "anon insert wa_clicks" ON wa_clicks FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;
