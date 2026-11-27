-- ================================================================
-- YFF Delivery settings on the farmer profile (client card 2026-11-27)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Needs scripts/courier-options-migration.sql first.
-- Safe to run twice.
-- STATUS: see CHECK-prod-migrations.sql (#37), not this line.
-- ================================================================
--
-- Before: every produce asked again for the cargo services, who pays, the
-- local radius and charge. Now the farmer sets them ONCE on their profile:
--   cargo_services         the services in their area that take ToPay
--   cargo_paid_by          'buyer' (ToPay) | 'farmer' (prepaid, free)
--   local_paid_by          'farmer' (free) | 'buyer' (local_delivery_charge)
--   local_delivery_charge  ₹ per order when the buyer pays
--   local_radius_km        how far they deliver locally (NULL = 25 km)
-- and on each produce only picks HOW it goes: courier_type
--   'local' | 'cargo' | 'both' (local for buyers within 20 km, cargo beyond).
--
-- The produce keeps its old columns (cargo_services, delivery_paid_by,
-- delivery_charge, delivery_radius_km): a trigger COPIES them from the
-- profile whenever the produce's delivery is saved, and every produce is
-- re-copied when the profile changes. So the feed, cart, orders, bulk market
-- and Android app read the same columns as before.
-- ================================================================

ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS cargo_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cargo_paid_by text,
  ADD COLUMN IF NOT EXISTS local_paid_by text,
  ADD COLUMN IF NOT EXISTS local_delivery_charge numeric(10,2),
  ADD COLUMN IF NOT EXISTS local_radius_km integer;

ALTER TABLE public.farmers DROP CONSTRAINT IF EXISTS farmers_delivery_settings_check;
ALTER TABLE public.farmers ADD CONSTRAINT farmers_delivery_settings_check CHECK (
  jsonb_typeof(cargo_services) = 'array'
  AND jsonb_array_length(cargo_services) <= 12
  AND (cargo_paid_by IS NULL OR cargo_paid_by IN ('farmer', 'buyer'))
  AND (local_paid_by IS NULL OR local_paid_by IN ('farmer', 'buyer'))
  AND (local_delivery_charge IS NULL OR (local_delivery_charge >= 0 AND local_delivery_charge <= 99999))
  AND (local_radius_km IS NULL OR (local_radius_km BETWEEN 1 AND 500))
);

-- 'both' joins local / cargo; a cargo or both produce lists ≥ 1 service.
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_courier_type_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_courier_type_check
  CHECK (courier_type IS NULL OR courier_type IN ('local', 'cargo', 'both'));
ALTER TABLE public.produce_listings DROP CONSTRAINT IF EXISTS produce_listings_cargo_services_check;
ALTER TABLE public.produce_listings ADD CONSTRAINT produce_listings_cargo_services_check
  CHECK (
    jsonb_typeof(cargo_services) = 'array'
    AND jsonb_array_length(cargo_services) <= 12
    AND (
      (courier_type IS NOT NULL AND courier_type IN ('cargo', 'both') AND jsonb_array_length(cargo_services) >= 1)
      OR ((courier_type IS NULL OR courier_type = 'local') AND jsonb_array_length(cargo_services) = 0)
    )
  );

-- Back-fill each farmer's profile from the produce they already have, so no
-- one has to type anything again: every cargo service any produce lists, the
-- cargo payer most of their cargo produce use, and the newest local produce's
-- payer / charge / radius.
UPDATE public.farmers f SET
  cargo_services = COALESCE((
    SELECT jsonb_agg(DISTINCT s.svc ORDER BY s.svc) FROM (
      SELECT jsonb_array_elements_text(p.cargo_services) AS svc
      FROM public.produce_listings p
      WHERE p.farmer_id = f.id AND p.courier_type = 'cargo'
    ) s
  ), '[]'::jsonb),
  cargo_paid_by = (
    SELECT p.delivery_paid_by FROM public.produce_listings p
    WHERE p.farmer_id = f.id AND p.courier_type = 'cargo' AND p.delivery_paid_by IS NOT NULL
    GROUP BY p.delivery_paid_by ORDER BY count(*) DESC, p.delivery_paid_by DESC LIMIT 1
  )
WHERE jsonb_array_length(f.cargo_services) = 0
  AND EXISTS (SELECT 1 FROM public.produce_listings p WHERE p.farmer_id = f.id AND p.courier_type = 'cargo');

-- Never more than 12 services (the profile CHECK).
UPDATE public.farmers SET cargo_services = (
  SELECT jsonb_agg(v) FROM (SELECT v FROM jsonb_array_elements(cargo_services) WITH ORDINALITY t(v, i) ORDER BY i LIMIT 12) x
) WHERE jsonb_array_length(cargo_services) > 12;

UPDATE public.farmers f SET (local_paid_by, local_delivery_charge, local_radius_km) = (
  SELECT p.delivery_paid_by,
         CASE WHEN p.delivery_paid_by = 'buyer' THEN p.delivery_charge ELSE NULL END,
         CASE WHEN p.delivery_radius_km BETWEEN 1 AND 500 THEN p.delivery_radius_km::integer ELSE NULL END
  FROM public.produce_listings p
  WHERE p.farmer_id = f.id AND p.courier_type = 'local' AND p.delivery_paid_by IS NOT NULL
  ORDER BY p.created_at DESC LIMIT 1
)
WHERE f.local_paid_by IS NULL
  AND EXISTS (SELECT 1 FROM public.produce_listings p WHERE p.farmer_id = f.id AND p.courier_type = 'local' AND p.delivery_paid_by IS NOT NULL);

-- Copy the profile onto a produce whenever its delivery is saved.
CREATE OR REPLACE FUNCTION public.produce_listings_delivery_from_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE f record;
BEGIN
  IF NEW.courier_type IS NULL THEN RETURN NEW; END IF;
  SELECT cargo_services, cargo_paid_by, local_paid_by, local_delivery_charge, local_radius_km
    INTO f FROM public.farmers WHERE id = NEW.farmer_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.courier_type IN ('cargo', 'both') THEN
    IF jsonb_array_length(COALESCE(f.cargo_services, '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'CARGO_PROFILE_REQUIRED: add your cargo services in your profile first.' USING ERRCODE = 'P0001';
    END IF;
    NEW.cargo_services := f.cargo_services;
    NEW.delivery_paid_by := COALESCE(f.cargo_paid_by, 'buyer');
    NEW.retail_reach := 'transport';
    NEW.retail_transport_rates := '{"AP": 0, "TG": 0}'::jsonb;
  ELSE
    NEW.cargo_services := '[]'::jsonb;
    NEW.delivery_paid_by := COALESCE(f.local_paid_by, 'farmer');
    NEW.retail_reach := 'local';
    NEW.retail_transport_rates := '{}'::jsonb;
  END IF;

  IF NEW.courier_type IN ('local', 'both') THEN
    NEW.delivery_charge := CASE WHEN f.local_paid_by = 'buyer' THEN COALESCE(f.local_delivery_charge, 0) ELSE 0 END;
    NEW.delivery_radius_km := f.local_radius_km;
  ELSE
    -- Nothing for cargo is paid online: ToPay, or the farmer pays it.
    NEW.delivery_charge := 0;
    NEW.delivery_radius_km := NULL;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.produce_listings_delivery_from_profile() FROM PUBLIC, anon, authenticated;

-- Only when the delivery is (re)saved — never on stock / status updates.
DROP TRIGGER IF EXISTS produce_listings_delivery_profile ON public.produce_listings;
CREATE TRIGGER produce_listings_delivery_profile
  BEFORE INSERT OR UPDATE OF courier_type, cargo_services, delivery_paid_by, delivery_charge, delivery_radius_km, delivery_mode
  ON public.produce_listings
  FOR EACH ROW EXECUTE FUNCTION public.produce_listings_delivery_from_profile();

-- Profile changed → re-copy onto every produce that is delivered.
CREATE OR REPLACE FUNCTION public.farmers_delivery_settings_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.produce_listings SET courier_type = courier_type
  WHERE farmer_id = NEW.id AND courier_type IS NOT NULL;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.farmers_delivery_settings_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS farmers_delivery_settings_sync ON public.farmers;
CREATE TRIGGER farmers_delivery_settings_sync
  AFTER UPDATE OF cargo_services, cargo_paid_by, local_paid_by, local_delivery_charge, local_radius_km
  ON public.farmers
  FOR EACH ROW
  WHEN (OLD.cargo_services IS DISTINCT FROM NEW.cargo_services
     OR OLD.cargo_paid_by IS DISTINCT FROM NEW.cargo_paid_by
     OR OLD.local_paid_by IS DISTINCT FROM NEW.local_paid_by
     OR OLD.local_delivery_charge IS DISTINCT FROM NEW.local_delivery_charge
     OR OLD.local_radius_km IS DISTINCT FROM NEW.local_radius_km)
  EXECUTE FUNCTION public.farmers_delivery_settings_sync();

-- Line every existing produce up with its (back-filled) profile once.
UPDATE public.produce_listings SET courier_type = courier_type WHERE courier_type IS NOT NULL;
