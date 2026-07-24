-- ============================================================
-- YourFamilyFarmer — STAGING schema
-- Generated from PRODUCTION (bzwczufnlqwlirtrccwr) on 2026-07-14.
--
-- Structure only: tables, keys, indexes, functions, triggers, RLS.
-- NO farmer/consumer/order data is copied.
--
-- HOW TO RUN:
--   1. Open the YFF-Staging project in Supabase.
--   2. SQL Editor -> New query.
--   3. Paste this whole file. Run.
--   4. Then run scripts/staging-seed.sql for test data.
--
-- Safe to run only on an EMPTY database. Do NOT run on production.
-- ============================================================

-- Production defaults use both gen_random_uuid() (pgcrypto) and uuid_generate_v4() (uuid-ossp)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sequence used by set_order_code() to build YFF-YYYYMMDD-NNNN codes
CREATE SEQUENCE IF NOT EXISTS public.order_code_seq AS bigint START 1 INCREMENT 1 MINVALUE 1 NO CYCLE;


-- ===== TABLES =====

CREATE TABLE IF NOT EXISTS public."consumers_auth" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "phone" character varying(15) NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_login_at" timestamp with time zone,
  "suspended" boolean DEFAULT false NOT NULL,
  "suspended_at" timestamp with time zone,
  "suspended_reason" text
);

CREATE TABLE IF NOT EXISTS public."delivery_agents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" character varying(100) NOT NULL,
  "phone" character varying(15) NOT NULL,
  "aadhaar_hash" text,
  "vehicle_type" text,
  "delivery_area" text,
  "availability" text[],
  "zone" character varying(60),
  "active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."delivery_boys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" character varying(15) NOT NULL,
  "alt_phone" character varying(15),
  "password_hash" text NOT NULL,
  "vehicle_type" text,
  "vehicle_number" text,
  "id_proof_path" text,
  "service_areas" text,
  "status" text DEFAULT 'pending_approval'::text NOT NULL,
  "activation_code" text,
  "approved_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "service_pincodes" text[],
  "zone" character varying(60),
  "approved_by" text,
  "rejected_at" timestamp with time zone,
  "rejection_reason" text
);

CREATE TABLE IF NOT EXISTS public."demand_intents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "region_slug" character varying(60),
  "crop_name" character varying(100),
  "quantity_kg" numeric(8,2),
  "needed_by_date" date,
  "delivery_location" text,
  "requester_name" character varying(100),
  "requester_phone" character varying(15),
  "fulfilled" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "consumer_id" uuid
);

CREATE TABLE IF NOT EXISTS public."escalations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid,
  "region_slug" character varying(60),
  "type" text DEFAULT 'other'::text NOT NULL,
  "description" text,
  "raised_by" text,
  "status" text DEFAULT 'open'::text NOT NULL,
  "resolution_notes" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "raised_by_role" text,
  "raised_by_id" uuid,
  "raised_by_phone" text
);

CREATE TABLE IF NOT EXISTS public."farmer_follows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "farmer_id" uuid NOT NULL,
  "consumer_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."farmer_otps" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "phone" text NOT NULL,
  "otp" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."farmers" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "slug" character varying(60) NOT NULL,
  "name" character varying(100) NOT NULL,
  "village" character varying(100),
  "district" character varying(100),
  "state" character varying(100) DEFAULT 'Andhra Pradesh'::character varying,
  "phone" character varying(15),
  "method" character varying(20),
  "farm_size_acres" numeric(5,2),
  "farming_since_year" integer,
  "story_quote" text,
  "soil_organic_carbon" numeric(4,2),
  "soil_ph" numeric(3,1),
  "brix_reading" numeric(4,1),
  "water_source" character varying(100),
  "delivery_available" boolean DEFAULT false,
  "pickup_available" boolean DEFAULT true,
  "farm_visit_day" character varying(20),
  "rating_avg" numeric(3,2) DEFAULT 0,
  "rating_count" integer DEFAULT 0,
  "buyer_count" integer DEFAULT 0,
  "region_slug" character varying(60),
  "active" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "pickup_locations" text[] DEFAULT '{}'::text[],
  "cover_photo_url" text,
  "photo_url" text,
  "pesticide_cert_url" text,
  "pickup_slots" jsonb,
  "password_hash" text,
  "lat" numeric(10,7),
  "lng" numeric(10,7),
  "location_name" text,
  "upi_id" text,
  "upi_qr_code_url" text,
  "cod_enabled" boolean DEFAULT false,
  "farm_address" text,
  "activation_code" text,
  "registered_by_moderator" uuid,
  "bank_account_number" text,
  "bank_ifsc" text
);

CREATE TABLE IF NOT EXISTS public."harvests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "produce_listing_id" uuid NOT NULL,
  "farmer_id" uuid,
  "harvested_at" timestamp with time zone NOT NULL,
  "shelf_life_days" integer,
  "approx_quantity" numeric,
  "unit" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stock_qty" numeric
);

CREATE TABLE IF NOT EXISTS public."media" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "farmer_id" uuid,
  "type" character varying(10),
  "url" text,
  "caption" text,
  "language" character varying(20),
  "has_subtitles" boolean DEFAULT false,
  "sort_order" integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public."moderators" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" character varying(100),
  "phone" character varying(15) NOT NULL,
  "password_hash" text NOT NULL,
  "region_slug" character varying(60) NOT NULL,
  "active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."notify_requests" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "farmer_id" uuid,
  "produce_name" character varying(100),
  "requester_name" character varying(100),
  "requester_phone" character varying(15),
  "created_at" timestamp with time zone DEFAULT now(),
  "notified_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."order_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_type" text DEFAULT 'system'::text NOT NULL,
  "actor_id" uuid,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "consumer_id" uuid,
  "farmer_id" uuid,
  "produce_listing_id" uuid,
  "quantity" numeric(8,2),
  "unit" text,
  "total_price" numeric(10,2),
  "delivery_type" text DEFAULT 'pickup'::text,
  "pickup_confirmed_at" timestamp with time zone,
  "courier_tracking_number" character varying(100),
  "courier_receipt_url" text,
  "courier_service" character varying(60),
  "dispatched_at" timestamp with time zone,
  "status" text DEFAULT 'pending'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "produce_name" text,
  "buyer_name" text,
  "buyer_phone" text,
  "pickup_location" text,
  "payment_status" text DEFAULT 'pending'::text,
  "payment_method" text DEFAULT 'cod'::text,
  "payment_screenshot_url" text,
  "utr_number" text,
  "decline_reason" text,
  "payment_proof_path" text,
  "delivery_status" text,
  "delivery_address" text,
  "delivery_landmark" text,
  "delivery_pincode" text,
  "delivery_alt_phone" text,
  "delivery_boy_id" uuid,
  "handover_otp" text,
  "assigned_at" timestamp with time zone,
  "picked_up_at" timestamp with time zone,
  "out_for_delivery_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "delivery_fee" integer DEFAULT 0,
  "rider_payout" integer DEFAULT 0,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "refund_status" text,
  "order_code" text,
  "refund_id" text,
  "refund_amount" integer,
  "refunded_at" timestamp with time zone,
  "idempotency_key" text,
  "fulfillment_date" timestamp with time zone,
  "payment_method_detail" text,
  "buyer_email" text,
  "paid_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "collected_at" timestamp with time zone,
  "shipped_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "reschedule_reason" text,
  "rescheduled_at" timestamp with time zone,
  "delivery_city" text,
  "platform_fee" numeric DEFAULT 0 NOT NULL,
  "harvest_id" uuid,
  "cod_deposit" numeric,
  "cod_balance_due" numeric,
  "cod_deposit_paid_at" timestamp with time zone,
  "cash_collected_at" timestamp with time zone,
  "cash_collected_by" uuid,
  "deposit_forfeited_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."otp_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "phone" character varying(15) NOT NULL,
  "session_id" text NOT NULL,
  "purpose" text DEFAULT 'forgot_password'::text,
  "user_type" text,
  "reset_token" text,
  "reset_token_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "expires_at" timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
  "used" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public."platform_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "fee_percent" numeric DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cod_deposit_percent" numeric DEFAULT 10 NOT NULL
);

CREATE TABLE IF NOT EXISTS public."price_guidelines" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "crop_name" character varying(100) NOT NULL,
  "region_slug" character varying(60) NOT NULL,
  "min_price" numeric(8,2),
  "max_price" numeric(8,2),
  "unit" character varying(20) DEFAULT 'kg'::character varying,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."produce_listings" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "farmer_id" uuid,
  "name" character varying(100) NOT NULL,
  "variety" character varying(100),
  "method" character varying(20),
  "unit" character varying(20) DEFAULT 'kg'::character varying,
  "emoji" character varying(10),
  "price_tier_1_qty" integer,
  "price_tier_1_price" numeric(8,2),
  "price_tier_2_qty" integer,
  "price_tier_2_price" numeric(8,2),
  "price_tier_3_qty" integer,
  "price_tier_3_price" numeric(8,2),
  "stock_qty" integer,
  "available_from" date,
  "available_to" date,
  "brix" numeric(4,1),
  "pesticide_result" character varying(100),
  "shelf_life_days" integer,
  "storage_notes" text,
  "status" character varying(20) DEFAULT 'available'::character varying,
  "created_at" timestamp with time zone DEFAULT now(),
  "description" text,
  "image_url" text,
  "soil_organic_carbon" numeric(4,2),
  "harvest_date" timestamp with time zone,
  "availability_period" text,
  "rejection_reason" text,
  "delivery_mode" text DEFAULT 'pickup'::text NOT NULL,
  "delivery_charge" numeric,
  "delivery_radius_km" numeric,
  "rating_avg" numeric(2,1),
  "review_count" integer DEFAULT 0 NOT NULL,
  "soil_ph" numeric,
  "how_we_grow" text,
  "category" text,
  "image_urls" jsonb,
  "availability_from" date,
  "availability_to" date,
  "harvest_frequency" text,
  "harvest_frequency_count" integer
);

CREATE TABLE IF NOT EXISTS public."produce_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "produce_listing_id" uuid NOT NULL,
  "farmer_id" uuid,
  "consumer_id" uuid,
  "reviewer_name" text NOT NULL,
  "reviewer_phone" text,
  "star_rating" integer NOT NULL,
  "review_text" text,
  "approved" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."regions" (
  "slug" character varying(60) NOT NULL,
  "name" character varying(100) NOT NULL,
  "district" character varying(100),
  "state" character varying(100),
  "lat" numeric(9,6),
  "lng" numeric(9,6),
  "radius_km" integer DEFAULT 25,
  "active" boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public."reviews" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "farmer_id" uuid,
  "produce_listing_id" uuid,
  "reviewer_name" character varying(100),
  "reviewer_location" character varying(100),
  "star_rating" integer,
  "review_text" text,
  "produce_ordered" character varying(100),
  "created_at" timestamp with time zone DEFAULT now(),
  "approved" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public."wa_clicks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "farmer_id" uuid NOT NULL,
  "clicked_at" timestamp with time zone DEFAULT now()
);

-- ===== CONSTRAINTS =====

ALTER TABLE public.consumers_auth ADD CONSTRAINT consumers_auth_pkey PRIMARY KEY (id);
ALTER TABLE public.consumers_auth ADD CONSTRAINT consumers_auth_phone_key UNIQUE (phone);
ALTER TABLE public.delivery_agents ADD CONSTRAINT delivery_agents_pkey PRIMARY KEY (id);
ALTER TABLE public.delivery_boys ADD CONSTRAINT delivery_boys_pkey PRIMARY KEY (id);
ALTER TABLE public.delivery_boys ADD CONSTRAINT delivery_boys_phone_key UNIQUE (phone);
ALTER TABLE public.demand_intents ADD CONSTRAINT demand_intents_pkey PRIMARY KEY (id);
ALTER TABLE public.escalations ADD CONSTRAINT escalations_pkey PRIMARY KEY (id);
ALTER TABLE public.farmer_follows ADD CONSTRAINT farmer_follows_pkey PRIMARY KEY (id);
ALTER TABLE public.farmer_follows ADD CONSTRAINT farmer_follows_farmer_id_consumer_id_key UNIQUE (farmer_id, consumer_id);
ALTER TABLE public.farmer_otps ADD CONSTRAINT farmer_otps_pkey PRIMARY KEY (id);
ALTER TABLE public.farmers ADD CONSTRAINT farmers_pkey PRIMARY KEY (id);
ALTER TABLE public.farmers ADD CONSTRAINT farmers_slug_key UNIQUE (slug);
ALTER TABLE public.farmers ADD CONSTRAINT farmers_method_check CHECK (((method)::text = ANY ((ARRAY['natural'::character varying, 'low_chemical'::character varying, 'chemical'::character varying])::text[])));
ALTER TABLE public.harvests ADD CONSTRAINT harvests_pkey PRIMARY KEY (id);
ALTER TABLE public.media ADD CONSTRAINT media_pkey PRIMARY KEY (id);
ALTER TABLE public.media ADD CONSTRAINT media_type_check CHECK (((type)::text = ANY ((ARRAY['photo'::character varying, 'video'::character varying])::text[])));
ALTER TABLE public.moderators ADD CONSTRAINT moderators_pkey PRIMARY KEY (id);
ALTER TABLE public.moderators ADD CONSTRAINT moderators_phone_key UNIQUE (phone);
ALTER TABLE public.notify_requests ADD CONSTRAINT notify_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.order_events ADD CONSTRAINT order_events_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.otp_sessions ADD CONSTRAINT otp_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_singleton CHECK ((id = 1));
ALTER TABLE public.price_guidelines ADD CONSTRAINT price_guidelines_pkey PRIMARY KEY (id);
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_pkey PRIMARY KEY (id);
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'coming_soon'::character varying, 'sold_out'::character varying, 'pending_review'::character varying, 'rejected'::character varying, 'suspended'::character varying, 'suspended_by_farmer'::character varying, 'paused'::character varying])::text[])));
ALTER TABLE public.produce_reviews ADD CONSTRAINT produce_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.produce_reviews ADD CONSTRAINT produce_reviews_star_rating_check CHECK (((star_rating >= 1) AND (star_rating <= 5)));
ALTER TABLE public.regions ADD CONSTRAINT regions_pkey PRIMARY KEY (slug);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_star_rating_check CHECK (((star_rating >= 1) AND (star_rating <= 5)));
ALTER TABLE public.wa_clicks ADD CONSTRAINT wa_clicks_pkey PRIMARY KEY (id);

-- Foreign keys (added after all tables exist, so creation order does not matter)
ALTER TABLE public.escalations ADD CONSTRAINT escalations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE public.farmer_follows ADD CONSTRAINT farmer_follows_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;
ALTER TABLE public.farmers ADD CONSTRAINT farmers_region_slug_fkey FOREIGN KEY (region_slug) REFERENCES regions(slug);
ALTER TABLE public.farmers ADD CONSTRAINT farmers_registered_by_moderator_fkey FOREIGN KEY (registered_by_moderator) REFERENCES moderators(id);
ALTER TABLE public.harvests ADD CONSTRAINT harvests_produce_listing_id_fkey FOREIGN KEY (produce_listing_id) REFERENCES produce_listings(id) ON DELETE CASCADE;
ALTER TABLE public.media ADD CONSTRAINT media_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;
ALTER TABLE public.notify_requests ADD CONSTRAINT notify_requests_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_boy_id_fkey FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_harvest_id_fkey FOREIGN KEY (harvest_id) REFERENCES harvests(id);
ALTER TABLE public.price_guidelines ADD CONSTRAINT price_guidelines_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES moderators(id) ON DELETE SET NULL;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_produce_listing_id_fkey FOREIGN KEY (produce_listing_id) REFERENCES produce_listings(id) ON DELETE SET NULL;
ALTER TABLE public.wa_clicks ADD CONSTRAINT wa_clicks_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;

-- ===== INDEXES =====

CREATE INDEX idx_consumers_auth_phone ON public.consumers_auth USING btree (phone);
CREATE INDEX delivery_agents_zone_active_idx ON public.delivery_agents USING btree (zone, active);
CREATE UNIQUE INDEX delivery_agents_zone_phone_idx ON public.delivery_agents USING btree (zone, phone);
CREATE INDEX idx_delivery_boys_phone ON public.delivery_boys USING btree (phone);
CREATE INDEX idx_delivery_boys_service_pincodes ON public.delivery_boys USING gin (service_pincodes);
CREATE INDEX idx_delivery_boys_status ON public.delivery_boys USING btree (status);
CREATE INDEX idx_delivery_boys_zone_status ON public.delivery_boys USING btree (zone, status);
CREATE INDEX demand_intents_consumer_id_idx ON public.demand_intents USING btree (consumer_id);
CREATE INDEX escalations_created_idx ON public.escalations USING btree (created_at DESC);
CREATE INDEX escalations_raiser_idx ON public.escalations USING btree (raised_by_role, raised_by_id, created_at DESC);
CREATE INDEX escalations_zone_status_idx ON public.escalations USING btree (region_slug, status);
CREATE INDEX idx_farmer_follows_consumer ON public.farmer_follows USING btree (consumer_id);
CREATE INDEX idx_farmer_follows_farmer ON public.farmer_follows USING btree (farmer_id);
CREATE INDEX idx_farmer_otps_expires ON public.farmer_otps USING btree (expires_at);
CREATE INDEX idx_farmer_otps_phone ON public.farmer_otps USING btree (phone);
CREATE UNIQUE INDEX farmers_activation_code_key ON public.farmers USING btree (activation_code) WHERE (activation_code IS NOT NULL);
CREATE INDEX farmers_registered_by_moderator_idx ON public.farmers USING btree (registered_by_moderator);
CREATE INDEX idx_harvests_farmer ON public.harvests USING btree (farmer_id, harvested_at DESC);
CREATE INDEX idx_harvests_listing ON public.harvests USING btree (produce_listing_id, harvested_at DESC);
CREATE INDEX idx_harvests_recent ON public.harvests USING btree (harvested_at DESC);
CREATE INDEX idx_media_farmer_id ON public.media USING btree (farmer_id);
CREATE INDEX idx_media_type ON public.media USING btree (type);
CREATE INDEX idx_order_events_created_at ON public.order_events USING btree (created_at);
CREATE INDEX idx_order_events_order_id ON public.order_events USING btree (order_id);
CREATE INDEX idx_orders_cod_balance ON public.orders USING btree (payment_status) WHERE (payment_status = 'deposit_paid'::text);
CREATE INDEX idx_orders_consumer_id ON public.orders USING btree (consumer_id);
CREATE INDEX idx_orders_delivery_boy ON public.orders USING btree (delivery_boy_id);
CREATE INDEX idx_orders_delivery_status ON public.orders USING btree (delivery_status);
CREATE INDEX idx_orders_delivery_type ON public.orders USING btree (delivery_type);
CREATE INDEX idx_orders_harvest ON public.orders USING btree (harvest_id);
CREATE INDEX idx_orders_payment_method ON public.orders USING btree (payment_method);
CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status);
CREATE INDEX idx_orders_razorpay_order_id ON public.orders USING btree (razorpay_order_id);
CREATE INDEX orders_idempotency_key_idx ON public.orders USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX orders_order_code_key ON public.orders USING btree (order_code);
CREATE INDEX idx_otp_sessions_phone ON public.otp_sessions USING btree (phone, created_at DESC);
CREATE INDEX idx_otp_sessions_reset_token ON public.otp_sessions USING btree (reset_token);
CREATE UNIQUE INDEX price_guidelines_crop_zone_idx ON public.price_guidelines USING btree (region_slug, lower((crop_name)::text));
CREATE INDEX idx_produce_reviews_listing ON public.produce_reviews USING btree (produce_listing_id, approved);
CREATE UNIQUE INDEX uq_produce_reviews_order ON public.produce_reviews USING btree (order_id);
CREATE INDEX idx_wa_clicks_farmer ON public.wa_clicks USING btree (farmer_id);

-- ===== COMMENTS =====

COMMENT ON TABLE public.delivery_boys IS 'Rider accounts. Service-role only; password scrypt-hashed; activation_code is one-time and cleared once consumed.';
COMMENT ON TABLE public.order_events IS 'Append-only audit trail of order changes. Written by the orders trigger; service-role only.';

-- ===== FUNCTIONS =====

CREATE OR REPLACE FUNCTION public.decrement_stock(p_listing_id uuid, p_qty numeric)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  affected int;
  has_null_stock boolean;
BEGIN
  UPDATE produce_listings
  SET stock_qty = stock_qty - p_qty
  WHERE id = p_listing_id
    AND stock_qty IS NOT NULL
    AND stock_qty >= p_qty;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RETURN TRUE;
  END IF;

  -- No row updated. Either the listing is missing, stock_qty was too low,
  -- or stock_qty is NULL (unlimited). Treat NULL stock as success.
  SELECT (stock_qty IS NULL) INTO has_null_stock
  FROM produce_listings WHERE id = p_listing_id;

  RETURN COALESCE(has_null_stock, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_stock(p_listing_id uuid, p_qty numeric)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE produce_listings
  SET stock_qty = stock_qty + p_qty
  WHERE id = p_listing_id AND stock_qty IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrement_harvest_stock(p_harvest_id uuid, p_qty numeric)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  affected int;
  has_null_stock boolean;
BEGIN
  UPDATE harvests
  SET stock_qty = stock_qty - p_qty
  WHERE id = p_harvest_id
    AND stock_qty IS NOT NULL
    AND stock_qty >= p_qty;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RETURN TRUE;
  END IF;

  SELECT (stock_qty IS NULL) INTO has_null_stock
  FROM harvests WHERE id = p_harvest_id;

  RETURN COALESCE(has_null_stock, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_harvest_stock(p_harvest_id uuid, p_qty numeric)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE harvests
  SET stock_qty = stock_qty + p_qty
  WHERE id = p_harvest_id AND stock_qty IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.farmer_buyer_count(p_farmer_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(distinct coalesce(consumer_id::text, buyer_phone))::int
  from public.orders
  where farmer_id = p_farmer_id;
$function$;

CREATE OR REPLACE FUNCTION public.set_order_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.order_code IS NULL THEN
    NEW.order_code := 'YFF-'
      || to_char((now() AT TIME ZONE 'Asia/Kolkata'), 'YYYYMMDD')
      || '-'
      || lpad(nextval('order_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_type text;
  v_actor_id   uuid;
BEGIN
  v_actor_type := COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system');
  BEGIN
    v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_actor_id := NULL;
  END;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO order_events (order_id, event_type, to_status, actor_type, actor_id, metadata)
    VALUES (
      NEW.id, 'order_placed', NEW.status,
      COALESCE(NULLIF(v_actor_type, 'system'), 'consumer'), v_actor_id,
      jsonb_build_object(
        'payment_method', NEW.payment_method,
        'delivery_type',  NEW.delivery_type,
        'total_price',    NEW.total_price
      )
    );
    RETURN NEW;
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id, note)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, v_actor_type, v_actor_id,
            CASE WHEN NEW.status = 'declined' THEN NEW.decline_reason END);
  END IF;

  IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, 'payment_change', OLD.payment_status, NEW.payment_status, v_actor_type, v_actor_id);
  END IF;

  IF (NEW.delivery_status IS DISTINCT FROM OLD.delivery_status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, 'delivery_change', OLD.delivery_status, NEW.delivery_status, v_actor_type, v_actor_id);
  END IF;

  IF (NEW.refund_status IS DISTINCT FROM OLD.refund_status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id, metadata)
    VALUES (NEW.id, 'refund_change', OLD.refund_status, NEW.refund_status, v_actor_type, v_actor_id,
            jsonb_build_object('refund_amount', NEW.refund_amount, 'refund_id', NEW.refund_id));
  END IF;

  RETURN NEW;
END;
$function$;


-- ===== TRIGGERS =====
CREATE TRIGGER trg_set_order_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION set_order_code();
CREATE TRIGGER trg_order_events_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION log_order_event();
CREATE TRIGGER trg_order_events_update AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION log_order_event();

-- ===== ROW LEVEL SECURITY =====
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produce_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notify_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumers_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_boys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produce_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public insert demand_intents" ON public.demand_intents FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public read demand_intents" ON public.demand_intents FOR SELECT TO public USING (true);
CREATE POLICY "public update demand_intents" ON public.demand_intents FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "public delete demand_intents" ON public.demand_intents FOR DELETE TO public USING (true);
CREATE POLICY "farmer_follows public read" ON public.farmer_follows FOR SELECT TO public USING (true);
CREATE POLICY "Allow insert farmers" ON public.farmers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update farmers" ON public.farmers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public read farmers" ON public.farmers FOR SELECT TO public USING (true);
CREATE POLICY "harvests public delete" ON public.harvests FOR DELETE TO public USING (true);
CREATE POLICY "harvests public insert" ON public.harvests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "harvests public read" ON public.harvests FOR SELECT TO public USING (true);
CREATE POLICY "harvests public update" ON public.harvests FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow insert media" ON public.media FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public read media" ON public.media FOR SELECT TO public USING (true);
CREATE POLICY "media public delete" ON public.media FOR DELETE TO public USING (true);
CREATE POLICY "media public update" ON public.media FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public insert notify" ON public.notify_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "authenticated insert orders" ON public.orders FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public read orders" ON public.orders FOR SELECT TO public USING (true);
CREATE POLICY "public_insert" ON public.orders FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public_select" ON public.orders FOR SELECT TO public USING (true);
CREATE POLICY "public_update" ON public.orders FOR UPDATE TO public USING (true);
CREATE POLICY "Public read platform settings" ON public.platform_settings FOR SELECT TO public USING (true);
CREATE POLICY "Allow insert produce" ON public.produce_listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public read produce" ON public.produce_listings FOR SELECT TO public USING (true);
CREATE POLICY "produce_listings public delete" ON public.produce_listings FOR DELETE TO public USING (true);
CREATE POLICY "produce_listings public update" ON public.produce_listings FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "produce_reviews public read" ON public.produce_reviews FOR SELECT TO public USING ((approved = true));
CREATE POLICY "Public read regions" ON public.regions FOR SELECT TO public USING (true);
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT TO public USING ((approved = true));
CREATE POLICY "public_insert_reviews" ON public.reviews FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public_select_reviews" ON public.reviews FOR SELECT TO public USING (true);
CREATE POLICY "anon insert wa_clicks" ON public.wa_clicks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anyone can insert wa_clicks" ON public.wa_clicks FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anyone can read wa_clicks" ON public.wa_clicks FOR SELECT TO public USING (true);
