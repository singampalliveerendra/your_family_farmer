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
  "cashfree_order_id" text,
  "cashfree_payment_id" text,
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
  "deposit_forfeited_at" timestamp with time zone,
  "is_preorder" boolean DEFAULT false NOT NULL,
  "preorder_expected_date" date,
  "is_self_order" boolean DEFAULT false NOT NULL,
  "farmer_resolved_at" timestamp with time zone
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

CREATE INDEX idx_orders_cashfree_order_id ON public.orders USING btree (cashfree_order_id);
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

-- ===== BROWSER (anon) ACCESS =====
-- `orders` has NO anon policy and NO anon grant on purpose: the browser does
-- not authenticate to Postgres, so RLS has no auth.uid() to scope rows by.
-- Every order read and write goes through an API route that verifies the
-- app's signed session cookie and queries with the service role. See
-- scripts/anon-lockdown-orders-reviews.sql for the full reasoning.
-- Do not "restore" a USING(true) policy here to make a screen work — move the
-- query behind a route instead.
--
-- `reviews` is readable by anon for APPROVED rows only, via column-level GRANT
-- (reviewer_phone is excluded as PII). Writes go through /api/reviews, which
-- enforces the rate limits a direct insert would skip.
CREATE POLICY "farmer_follows public read" ON public.farmer_follows FOR SELECT TO public USING (true);
-- NOTE: the farmers read policy is row-unrestricted, but the columns anon
-- can read are narrowed by the GRANTs further down. See
-- scripts/farmers-column-lockdown.sql for the reasoning.
--
-- No public INSERT/UPDATE/DELETE policy on farmers, produce_listings,
-- harvests, media or demand_intents since scripts/seller-writes-lockdown.sql
-- (2026-11-05): those writes go through login-checked server routes using the
-- service role. demand_intents has no public READ either (buyers' phones).
CREATE POLICY "Public read farmers" ON public.farmers FOR SELECT TO public USING (true);
CREATE POLICY "harvests public read" ON public.harvests FOR SELECT TO public USING (true);
CREATE POLICY "Public read media" ON public.media FOR SELECT TO public USING (true);
CREATE POLICY "Public insert notify" ON public.notify_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public read platform settings" ON public.platform_settings FOR SELECT TO public USING (true);
CREATE POLICY "Public read produce" ON public.produce_listings FOR SELECT TO public USING (true);
CREATE POLICY "produce_reviews public read" ON public.produce_reviews FOR SELECT TO public USING ((approved = true));
CREATE POLICY "Public read regions" ON public.regions FOR SELECT TO public USING (true);
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT TO public USING ((approved = true));
CREATE POLICY "anon insert wa_clicks" ON public.wa_clicks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anyone can insert wa_clicks" ON public.wa_clicks FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anyone can read wa_clicks" ON public.wa_clicks FOR SELECT TO public USING (true);


-- ============================================================================
-- Column-level grants (scripts/farmers-column-lockdown.sql)
--
-- RLS policies filter ROWS, never COLUMNS. `farmers` holds password_hash,
-- bank_account_number, bank_ifsc and activation_code alongside public profile
-- data, and the anon key is public by design (it ships in the JS bundle), so
-- the blanket table grants made those four columns world-readable and
-- world-writable. Column grants compose with RLS -- a query must satisfy both.
-- ============================================================================

REVOKE ALL ON public.farmers FROM anon, authenticated;

GRANT SELECT (
  id, slug, name, village, district, state, method,
  farm_size_acres, farming_since_year, story_quote, soil_organic_carbon,
  soil_ph, brix_reading, water_source, delivery_available,
  pickup_available, farm_visit_day, rating_avg, rating_count,
  buyer_count, region_slug, active, created_at, pickup_locations,
  cover_photo_url, photo_url, pesticide_cert_url, pickup_slots,
  location_name, cod_enabled,
  registered_by_moderator, facebook_url, instagram_url,
  youtube_url, account_type, contact_person,
  how_we_aggregate, business_cert_url, organic_certificate_url,
  terms_accepted_at, approval_status
) ON public.farmers TO anon, authenticated;
-- NOT granted since scripts/seller-writes-lockdown.sql (2026-11-05): phone,
-- farm_address, lat, lng, pickup_location_phones, upi_id, upi_qr_code_url
-- (FARMER_HIDDEN_COLUMNS in src/lib/farmerColumns.ts). And no UPDATE grant
-- at all — sellers edit their profile through /api/farmer/profile.



-- ============================================================================
-- Settings → Default dashboard (scripts/default-dashboard-migration.sql)
-- Service-role only: RLS on, no policies, no anon/authenticated grants.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
  phone text PRIMARY KEY CHECK (phone ~ '^[0-9]{10}$'),
  default_dashboard text NOT NULL CHECK (default_dashboard IN ('farmer', 'consumer')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_preferences FROM anon, authenticated;


-- ============================================================================
-- Consumer saved delivery address (scripts/consumer-saved-address-migration.sql)
-- consumers_auth stays service-role only; read/written via /api/consumer/profile.
-- ============================================================================

ALTER TABLE public.consumers_auth
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_landmark text,
  ADD COLUMN IF NOT EXISTS address_pincode text,
  ADD COLUMN IF NOT EXISTS address_alt_phone text,
  ADD COLUMN IF NOT EXISTS address_updated_at timestamptz;


-- ============================================================================
-- Sale step (scripts/sale-step-migration.sql) — was missing from this file.
-- ============================================================================
ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS sale_step numeric(6,3);
ALTER TABLE public.produce_listings
  ALTER COLUMN stock_qty TYPE numeric(10,3),
  ALTER COLUMN price_tier_1_qty TYPE numeric(10,3),
  ALTER COLUMN price_tier_2_qty TYPE numeric(10,3),
  ALTER COLUMN price_tier_3_qty TYPE numeric(10,3);
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_sale_step_positive;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_sale_step_positive
  CHECK (sale_step IS NULL OR sale_step > 0);


-- ============================================================================
-- Wholesale (scripts/wholesale-migration.sql)
-- Retail / Wholesale / Both per produce; retail and wholesale share
-- harvests.stock_qty. orders.order_type marks each order.
-- ============================================================================
ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS sale_mode text NOT NULL DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS wholesale_price numeric(8,2),
  ADD COLUMN IF NOT EXISTS wholesale_min_qty numeric(10,3),
  ADD COLUMN IF NOT EXISTS wholesale_pack_size numeric(10,3),
  ADD COLUMN IF NOT EXISTS wholesale_transport_states text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_sale_mode_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_sale_mode_check
  CHECK (sale_mode IN ('retail', 'wholesale', 'both'));
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_fields_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_fields_check
  CHECK (sale_mode = 'retail' OR (COALESCE(wholesale_price, 0) > 0 AND COALESCE(wholesale_min_qty, 0) > 0));
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_pack_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_pack_check
  CHECK (wholesale_pack_size IS NULL OR wholesale_pack_size > 0);
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_transport_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_transport_check
  -- 'IN' = anywhere in India (scripts/all-india-transport-migration.sql, 2026-11-11).
  CHECK (wholesale_transport_states <@ ARRAY['AP', 'TG', 'IN']::text[]);
CREATE INDEX IF NOT EXISTS idx_produce_listings_wholesale
  ON public.produce_listings (sale_mode) WHERE sale_mode <> 'retail';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'retail';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('retail', 'wholesale'));

-- ── Aggregator subscriptions (scripts/subscription-migration.sql, 2026-11-04) ──
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  name_en         text NOT NULL,
  name_te         text,
  duration_days   integer NOT NULL,
  actual_price    numeric(10,2) NOT NULL,
  offer_enabled   boolean NOT NULL DEFAULT false,
  offer_price     numeric(10,2),
  offer_ends_at   timestamptz,
  offer_label_en  text,
  offer_label_te  text,
  highlights_en   text,
  highlights_te   text,
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.moderators(id) ON DELETE SET NULL
);

ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_kind_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_kind_check
  CHECK (kind IN ('buying', 'selling', 'combined'));
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_name_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_name_check
  CHECK (length(btrim(name_en)) BETWEEN 1 AND 60 AND (name_te IS NULL OR length(name_te) <= 60));
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_duration_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_duration_check
  CHECK (duration_days BETWEEN 1 AND 3650);
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_price_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_price_check
  CHECK (actual_price >= 0 AND actual_price <= 1000000);
-- An offer must be a real discount. COALESCE so a NULL offer price can never
-- slip through an enabled offer (a bare comparison passes on NULL).
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_offer_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_offer_check
  CHECK (
    (offer_price IS NULL OR (offer_price >= 0 AND offer_price < actual_price))
    AND (NOT offer_enabled OR COALESCE(offer_price, -1) >= 0)
  );

CREATE INDEX IF NOT EXISTS subscription_plans_active_idx
  ON public.subscription_plans (active, sort_order);

-- Exactly three fixed plans, one per kind: Buying, Selling, Buying + Selling
-- (scripts/fixed-plans-migration.sql, 2026-11-10). Moderators edit, never add.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_kind_unique
  ON public.subscription_plans (kind);

CREATE TABLE IF NOT EXISTS public.aggregator_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_id   uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  plan_id         uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  kind            text NOT NULL,
  source          text NOT NULL,
  status          text NOT NULL DEFAULT 'active',
  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz,
  amount_paid     numeric(10,2) NOT NULL DEFAULT 0,
  plan_name       text,
  price_actual    numeric(10,2),
  granted_by      uuid REFERENCES public.moderators(id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_kind_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_kind_check
  CHECK (kind IN ('buying', 'selling', 'combined'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_source_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_source_check
  CHECK (source IN ('payment', 'free_plan', 'manual', 'free_forever'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_status_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'cancelled'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_dates_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_dates_check
  CHECK (
    (ends_at IS NULL OR ends_at > starts_at)
    -- Only a moderator's grant may run forever; anything bought or free has an end.
    AND (ends_at IS NOT NULL OR source IN ('free_forever', 'manual'))
  );
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_amount_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_amount_check
  CHECK (amount_paid >= 0 AND (source = 'payment' OR amount_paid = 0));

CREATE INDEX IF NOT EXISTS aggregator_subscriptions_holder_idx
  ON public.aggregator_subscriptions (aggregator_id, status, ends_at);

-- ── Security ─────────────────────────────────────────────────────
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregator_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_plans FROM anon, authenticated;
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
DROP POLICY IF EXISTS subscription_plans_public_read ON public.subscription_plans;
CREATE POLICY subscription_plans_public_read ON public.subscription_plans
  FOR SELECT TO anon, authenticated USING (active = true);

REVOKE ALL ON public.aggregator_subscriptions FROM anon, authenticated;
-- (no policies: service role only)

-- ── Aggregator subscription payments (scripts/subscription-payments-migration.sql, 2026-11-04) ──
ALTER TABLE public.aggregator_subscriptions
  ADD COLUMN IF NOT EXISTS cashfree_order_id text,
  ADD COLUMN IF NOT EXISTS payment_ref       text,
  ADD COLUMN IF NOT EXISTS payment_label     text,
  ADD COLUMN IF NOT EXISTS paid_at           timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_no        text,
  ADD COLUMN IF NOT EXISTS duration_days     integer,
  ADD COLUMN IF NOT EXISTS start_mode        text NOT NULL DEFAULT 'now';

CREATE UNIQUE INDEX IF NOT EXISTS aggregator_subscriptions_cashfree_order_idx
  ON public.aggregator_subscriptions (cashfree_order_id) WHERE cashfree_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS aggregator_subscriptions_receipt_idx
  ON public.aggregator_subscriptions (receipt_no) WHERE receipt_no IS NOT NULL;

ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_start_mode_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_start_mode_check
  CHECK (start_mode IN ('now', 'after_current'));
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_duration_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_duration_check
  CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650);
-- A payment row only counts once it is really paid: an ACTIVE payment row must
-- name its Cashfree order and when it was paid.
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_paid_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_paid_check
  CHECK (source <> 'payment' OR status <> 'active' OR (cashfree_order_id IS NOT NULL AND paid_at IS NOT NULL));
-- Only payment rows carry a Cashfree order.
ALTER TABLE public.aggregator_subscriptions DROP CONSTRAINT IF EXISTS aggregator_subscriptions_cashfree_check;
ALTER TABLE public.aggregator_subscriptions ADD CONSTRAINT aggregator_subscriptions_cashfree_check
  CHECK (cashfree_order_id IS NULL OR source = 'payment');

CREATE INDEX IF NOT EXISTS aggregator_subscriptions_ending_idx
  ON public.aggregator_subscriptions (status, ends_at);

CREATE TABLE IF NOT EXISTS public.subscription_listing_holds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_id   uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  listing_id      uuid NOT NULL REFERENCES public.produce_listings(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  held_at         timestamptz NOT NULL DEFAULT now(),
  held_by         uuid REFERENCES public.moderators(id) ON DELETE SET NULL,
  released_at     timestamptz
);
-- A listing is held at most once at a time.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_listing_holds_open_idx
  ON public.subscription_listing_holds (listing_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS subscription_listing_holds_agg_idx
  ON public.subscription_listing_holds (aggregator_id, released_at);

ALTER TABLE public.subscription_listing_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_listing_holds FROM anon, authenticated;
-- (no policies: service role only)

-- ── Bulk orders (scripts/bulk-orders-migration.sql, 2026-11-04) ──
ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS wholesale_transport_rates jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_transport_rates_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_transport_rates_check
  CHECK (jsonb_typeof(wholesale_transport_rates) = 'object');

-- ── Selling in packs (scripts/pack-pricing-migration.sql, 2026-11-10) ──
ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS retail_pack_size numeric(10,3),
  ADD COLUMN IF NOT EXISTS retail_pack_price numeric(8,2),
  ADD COLUMN IF NOT EXISTS retail_pack_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS wholesale_pack_price numeric(8,2);

-- A retail pack is a size AND a price, or neither; tiers only with a pack.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_pack_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_pack_check
  CHECK (
    (retail_pack_size IS NULL AND retail_pack_price IS NULL)
    -- IS NOT NULL spelled out: a bare "> 0" on a NULL passes a CHECK.
    OR (retail_pack_size IS NOT NULL AND retail_pack_price IS NOT NULL AND retail_pack_size > 0 AND retail_pack_price > 0)
  );
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_pack_tiers_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_pack_tiers_check
  CHECK (
    jsonb_typeof(retail_pack_tiers) = 'array'
    AND jsonb_array_length(retail_pack_tiers) <= 2
    AND (retail_pack_size IS NOT NULL OR jsonb_array_length(retail_pack_tiers) = 0)
  );

-- A wholesale pack price only goes with a wholesale pack size.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_wholesale_pack_price_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_wholesale_pack_price_check
  CHECK (wholesale_pack_price IS NULL OR (wholesale_pack_price > 0 AND wholesale_pack_size IS NOT NULL));

-- ── Delivery step: courier type / cargo services / who pays (scripts/courier-options-migration.sql, 2026-11-10) ──
ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS courier_type text,
  ADD COLUMN IF NOT EXISTS cargo_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_paid_by text;

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_courier_type_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_courier_type_check
  CHECK (courier_type IS NULL OR courier_type IN ('local', 'cargo'));

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_delivery_paid_by_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_delivery_paid_by_check
  CHECK (delivery_paid_by IS NULL OR delivery_paid_by IN ('farmer', 'buyer'));

-- Cargo needs at least one service; nothing else may carry a list.
-- (IS NOT NULL spelled out where it matters: a bare comparison on NULL passes a CHECK.)
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_cargo_services_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_cargo_services_check
  CHECK (
    jsonb_typeof(cargo_services) = 'array'
    AND jsonb_array_length(cargo_services) <= 12
    AND (
      (courier_type IS NOT NULL AND courier_type = 'cargo' AND jsonb_array_length(cargo_services) >= 1)
      OR ((courier_type IS NULL OR courier_type <> 'cargo') AND jsonb_array_length(cargo_services) = 0)
    )
  );

-- A courier type always says who pays.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_courier_paid_by_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_courier_paid_by_check
  CHECK (courier_type IS NULL OR delivery_paid_by IS NOT NULL);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cargo_service text,
  ADD COLUMN IF NOT EXISTS cargo_paid_by text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cargo_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_cargo_check
  CHECK (
    (cargo_service IS NULL AND cargo_paid_by IS NULL)
    OR (cargo_service IS NOT NULL AND cargo_paid_by IS NOT NULL
        AND cargo_paid_by IN ('farmer', 'buyer')
        AND length(btrim(cargo_service)) BETWEEN 1 AND 40)
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buyer_aggregator_id uuid REFERENCES public.farmers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_charge    numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_state     text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_charge_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_charge_check
  CHECK (transport_charge >= 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_state_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_state_check
  -- 'IN' = anywhere in India (scripts/all-india-transport-migration.sql, 2026-11-11).
  CHECK (transport_state IS NULL OR transport_state IN ('AP', 'TG', 'IN'));
-- A bulk purchase is wholesale, online-paid, and not also a household order.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_bulk_purchase_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_bulk_purchase_check
  CHECK (buyer_aggregator_id IS NULL OR (order_type = 'wholesale' AND payment_method = 'cashfree' AND consumer_id IS NULL));

CREATE INDEX IF NOT EXISTS orders_buyer_aggregator_idx
  ON public.orders (buyer_aggregator_id, created_at DESC) WHERE buyer_aggregator_id IS NOT NULL;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS bulk_fee_percent numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_bulk_fee_check;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_bulk_fee_check
  CHECK (bulk_fee_percent >= 0 AND bulk_fee_percent <= 100);

-- ── Selling lock (scripts/selling-lock-migration.sql, 2026-11-04) ──
CREATE OR REPLACE FUNCTION public.aggregator_can_sell(p_farmer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aggregator_subscriptions s
    WHERE s.aggregator_id = p_farmer
      AND s.status = 'active'
      AND s.kind IN ('selling', 'combined')
      AND s.starts_at <= now()
      AND (s.ends_at IS NULL OR s.ends_at > now())
  )
$$;
REVOKE ALL ON FUNCTION public.aggregator_can_sell(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_aggregator_selling_plan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Not going on sale: drafts, paused, suspended, rejected… always allowed.
  IF NEW.status IS NULL OR NEW.status NOT IN ('available', 'coming_soon', 'sold_out') THEN
    RETURN NEW;
  END IF;
  -- Already on sale before this change: stock / price / sold-out edits.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('available', 'coming_soon', 'sold_out') THEN
    RETURN NEW;
  END IF;
  -- Farmers are free, always.
  IF NOT EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = NEW.farmer_id AND f.account_type = 'aggregator') THEN
    RETURN NEW;
  END IF;
  IF public.aggregator_can_sell(NEW.farmer_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'SELLING_PLAN_REQUIRED: a Selling plan is needed to put produce on sale.'
    USING ERRCODE = 'P0001';
END
$$;
REVOKE ALL ON FUNCTION public.enforce_aggregator_selling_plan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS produce_listings_selling_plan ON public.produce_listings;
CREATE TRIGGER produce_listings_selling_plan
  BEFORE INSERT OR UPDATE OF status ON public.produce_listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_aggregator_selling_plan();


-- ============================================================================
-- Seller writes lockdown (scripts/seller-writes-lockdown.sql, 2026-11-05)
-- The anon key ships in the website's JavaScript: it may READ public data
-- only. Every write to these tables goes through a login-checked server route.
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.produce_listings, public.harvests, public.media, public.farmers
  FROM anon, authenticated;
REVOKE ALL ON public.demand_intents FROM anon, authenticated;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.notify_requests FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric),
                           public.increment_stock(uuid, numeric),
                           public.decrement_harvest_stock(uuid, numeric),
                           public.increment_harvest_stock(uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric),
                          public.increment_stock(uuid, numeric),
                          public.decrement_harvest_stock(uuid, numeric),
                          public.increment_harvest_stock(uuid, numeric)
  TO service_role;

-- Aggregators' growers (20260811_aggregator.sql): name + village only.
DO $$
BEGIN
  IF to_regclass('public.source_farmers') IS NOT NULL THEN
    REVOKE ALL ON public.source_farmers FROM anon, authenticated;
    GRANT SELECT (id, aggregator_id, name, village, created_at, updated_at)
      ON public.source_farmers TO anon, authenticated;
  END IF;
END $$;

-- farm-images storage: see scripts/storage-buckets-all.sql (no public write
-- or list policy; 8 MB; photos only).


-- ============================================================================
-- Transport billed after delivery: per km + cargo bill
-- (scripts/transport-bill-migration.sql, 2026-11-05). orders stays server-only.
-- The cargo-bills bucket is in scripts/storage-buckets-all.sql (private).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS transport_mode text,
  ADD COLUMN IF NOT EXISTS transport_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS transport_bill_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_bill_path text,
  ADD COLUMN IF NOT EXISTS transport_billed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transport_paid_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_mode_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_mode_check
  CHECK (transport_mode IS NULL OR transport_mode IN ('per_km', 'cargo_bill'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_transport_bill_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_bill_check CHECK (
  (transport_rate IS NULL OR transport_rate > 0)
  AND (transport_km IS NULL OR (transport_km > 0 AND transport_km <= 5000))
  AND (transport_bill_amount IS NULL OR (transport_bill_amount >= 0 AND transport_bill_amount <= 9999999.99))
  AND (transport_paid_at IS NULL OR transport_billed_at IS NOT NULL)
);


-- ============================================================================
-- Retail produce: Local only / Transportable across AP & TG
-- (scripts/retail-reach-migration.sql, 2026-11-05). Public product info like
-- the price; writes stay server-only.
-- ============================================================================

ALTER TABLE public.produce_listings
  ADD COLUMN IF NOT EXISTS retail_reach text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS retail_transport_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_reach_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_reach_check
  CHECK (retail_reach IN ('local', 'transport'));

ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_retail_rates_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_retail_rates_check
  CHECK (jsonb_typeof(retail_transport_rates) = 'object');

