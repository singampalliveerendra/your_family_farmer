-- ================================================================
-- Go Grameen — is prod already migrated?
-- READ-ONLY. Changes nothing. Safe to run any time.
--
-- Run in: Supabase (PROD) > SQL Editor > New Query > Run
--
-- Every row should read PRESENT. Any MISSING row means PROD-migrations.sql
-- still needs to run (running it is safe either way — it is idempotent).
-- ================================================================

SELECT * FROM (

  -- ---- 20260811_aggregator.sql ----
  SELECT 1 AS ord, '20260811' AS migration, 'farmers.account_type' AS object,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='farmers' AND column_name='account_type')
      THEN 'PRESENT' ELSE 'MISSING' END AS status
  UNION ALL
  SELECT 2, '20260811', 'farmers.approval_status',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='farmers' AND column_name='approval_status')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 3, '20260811', 'farmers.organic_certificate_url',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='farmers' AND column_name='organic_certificate_url')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 4, '20260811', 'source_farmers (table)',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_name='source_farmers')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 5, '20260811', 'source_farmers.village',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='source_farmers' AND column_name='village')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 6, '20260811', 'payout_accounts (table)',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_name='payout_accounts')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 7, '20260811', 'harvests.source_farmer_id',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='harvests' AND column_name='source_farmer_id')
      THEN 'PRESENT' ELSE 'MISSING' END

  -- ---- 20260812_farmer_method_organic.sql ----
  UNION ALL
  SELECT 8, '20260812', 'farmers_method_check allows organic',
    CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='farmers_method_check'
        AND pg_get_constraintdef(oid) LIKE '%organic%')
      THEN 'PRESENT' ELSE 'MISSING' END

  -- ---- 20260814_source_farmer_on_produce.sql ----
  UNION ALL
  SELECT 9, '20260814', 'produce_listings.source_farmer_id',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='produce_listings' AND column_name='source_farmer_id')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 10, '20260814', 'trigger produce_listings_source_farmer_trigger',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgname='produce_listings_source_farmer_trigger' AND NOT tgisinternal)
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  SELECT 11, '20260814', 'trigger harvests_source_farmer_trigger',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgname='harvests_source_farmer_trigger' AND NOT tgisinternal)
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  -- The 20260814 trigger INHERITS the listing's farmer; the 20260811 version
  -- raised an error instead. Same trigger name, different body — so this is the
  -- one check that tells you whether 20260814 actually replaced 20260811.
  SELECT 12, '20260814', 'harvest trigger is the INHERIT version (not 20260811)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc
      WHERE proname='enforce_harvest_source_farmer'
        AND prosrc LIKE '%Set it on the produce first%')
      THEN 'PRESENT' ELSE 'MISSING' END

  UNION ALL

  -- ---- sale-step-migration.sql (part-units: 250 g of mirchi) ----
  -- MISSING here means EVERY produce edit fails, not just the step feature:
  -- the farmer/moderator forms always send sale_step, so PostgREST rejects the
  -- whole row with "Could not find the 'sale_step' column ... in the schema cache".
  SELECT 13, 'sale-step', 'produce_listings.sale_step',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='produce_listings' AND column_name='sale_step')
      THEN 'PRESENT' ELSE 'MISSING' END
  UNION ALL
  -- The column alone is not enough: an integer stock_qty silently truncates
  -- 0.25 kg to 0, so the widening half of the migration has to be there too.
  SELECT 14, 'sale-step', 'produce_listings.stock_qty is fractional',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='produce_listings' AND column_name='stock_qty'
        AND numeric_scale > 0)
      THEN 'PRESENT' ELSE 'MISSING' END

) checks ORDER BY ord;


-- ================================================================
-- Would the method constraint fail? (also read-only)
--
-- 20260812 DROPs and re-ADDs farmers_method_check. If any existing row holds a
-- method outside the four allowed values, that ADD fails and the whole script
-- rolls back. This should return zero rows.
-- ================================================================
SELECT method, count(*) AS rows_that_would_block_the_migration
FROM farmers
WHERE method IS NOT NULL
  AND method NOT IN ('natural', 'organic', 'low_chemical', 'chemical')
GROUP BY method;
