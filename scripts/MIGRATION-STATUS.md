# Migration Status

How this file works: these `scripts/*.sql` migrations are **hand-run** (no
migrations-tracking table), so status is verified by **schema state** — checking
that the columns / policies / objects each migration creates actually exist in a
given database. Re-verify with the snapshot query at the bottom.

- ✅ verified present in that environment's live schema
- ▫️ not verified from here (run it / check it manually)
- Prod (`bzwczufnlqwlirtrccwr`) is **not reachable via MCP** since 2026-07-24
  (access switched to staging). Prod column marked ▫️ = verify manually.

Last staging audit: **2026-07-24** (all present).

## Recent / high-value migrations

| Migration | Schema footprint (what to check) | Staging | Prod |
|---|---|:--:|:--:|
| **farmers-column-lockdown** (SECURITY) | `has_column_privilege('anon','public.farmers','password_hash','SELECT')` is **false** | ✅ (2026-08-29) | ▫️ **RUN THIS FIRST** |
| consumer-intents-migration | `demand_intents.consumer_id` + UPDATE/DELETE policies | ✅ | ✅ (applied 2026-07-24) |
| realtime-orders-migration | `orders` in `supabase_realtime` pub + `orders` REPLICA IDENTITY FULL | ✅ | ▫️ (run at go-live) |
| delivery-charge-migration | `platform_settings.delivery_base_fee/extra_fee`, `orders.checkout_id/delivery_fee_refunded` | ✅ | ▫️ |
| cod-deposit-migration | `orders.cod_deposit/cod_balance_due/cod_deposit_paid_at/deposit_forfeited_at` | ✅ | ▫️ |
| cod-toggle-migration | `farmers.cod_enabled` | ✅ | ▫️ |
| platform-fee-migration | `orders.platform_fee`, `platform_settings.fee_percent` | ✅ | ▫️ |
| reschedule-reason-migration | `orders.reschedule_reason/rescheduled_at` | ✅ | ▫️ |
| order-acknowledge-migration | `orders.acknowledged_at` | ✅ | ▫️ |
| harvests-migration | `harvests` table | ✅ | ▫️ |
| harvest-as-product-migration | `orders.harvest_id`, `harvests.stock_qty` | ✅ | ▫️ |
| produce-harvest-shelf-migration | `produce_listings.shelf_life_days` | ✅ | ▫️ |
| produce-availability-frequency-migration | `produce_listings.availability_from/to, harvest_frequency(_count)` | ✅ | ▫️ |
| produce-category-photos-migration | `produce_listings.category, image_urls` | ✅ | ▫️ |
| farmer-follows-migration | `farmer_follows` table | ✅ | ▫️ |
| produce-reviews-migration | `produce_reviews` table | ✅ | ▫️ |
| feature-migration (#11 reviewer_phone) | `reviews.reviewer_phone`, `produce_reviews.reviewer_phone` | ✅ | ✅ (applied 2026-07-15) |
| rider-approval-migration | `delivery_boys.approved_by/rejected_at/rejection_reason/service_pincodes` | ✅ | ▫️ |
| idempotency-migration | `orders.idempotency_key` | ✅ | ▫️ |
| fulfillment-datetime-migration | `orders.fulfillment_date` | ✅ | ▫️ |
| orders-delivery-city-migration | `orders.delivery_city` | ✅ | ▫️ |
| orders-consumer-id-migration | `orders.consumer_id` | ✅ | ▫️ |
| order-code-migration | `orders.order_code`, seq `order_code_seq`, `set_order_code()` | ✅ | ▫️ |
| consumer-suspend-migration | `consumers_auth.suspended/suspended_at/suspended_reason` | ✅ | ▫️ |
| farm-address-migration | `farmers.farm_address` | ✅ | ▫️ |
| farmers-moderator-registration | `farmers.registered_by_moderator/activation_code/bank_*` | ✅ | ▫️ |
| complaints-self-service-migration | `escalations.raised_by_role/raised_by_id/raised_by_phone` | ✅ | ▫️ |
| produce-status-farmer-takedown-migration | `produce_listings.status/rejection_reason` | ✅ | ▫️ |
| produce-listings-delete-policy / update-policy | `produce_listings` DELETE + UPDATE policies | ✅ | ▫️ |
| media-anon-write-policies | `media` INSERT/UPDATE/DELETE policies | ✅ | ▫️ |
| otp-sessions-migration | `otp_sessions` table | ✅ | ▫️ |
| farmer-soil-ph-migration | `farmers.soil_ph`, `produce_listings.soil_ph` | ✅ | ▫️ |
| payment-proof-migration | `orders.payment_proof_path` | ✅ | ▫️ |
| razorpay-payment-migration | `orders.razorpay_order_id/razorpay_payment_id` | ✅ | ▫️ |
| refund-migration | `orders.refund_status/refund_id/refund_amount/refunded_at` | ✅ | ▫️ |

## Infrastructure (not a single migration)

| Item | Check | Staging | Prod |
|---|---|:--:|:--:|
| storage-buckets-all | buckets `farm-images`, `payment-proofs`, `rider-id-proofs` | ✅ | ▫️ |
| triggers | `trg_set_order_code`, `trg_order_events_insert`, `trg_order_events_update` | ✅ | ▫️ |
| functions | order-code, stock inc/dec, `farmer_buyer_count`, `log_order_event`, `rls_auto_enable` | ✅ | ▫️ |

Older migrations not listed above are baked into `staging-schema.sql`
(generated from prod 2026-07-14) and confirmed by the complete table structure.

## Re-verify query

Run in the target project's SQL Editor to snapshot columns / policies / realtime
/ functions, then compare to the footprints above:

```sql
select json_build_object(
  'tables', (select coalesce(json_object_agg(table_name, cols),'{}') from (
      select table_name, json_agg(column_name order by ordinal_position) cols
      from information_schema.columns where table_schema='public' group by table_name) x),
  'policies_by_table', (select coalesce(json_object_agg(tablename, cmds),'{}') from (
      select tablename, json_agg(distinct cmd) cmds from pg_policies where schemaname='public' group by tablename) y),
  'realtime_tables', (select coalesce(json_agg(tablename order by tablename),'[]')
      from pg_publication_tables where pubname='supabase_realtime'),
  'orders_replica_identity', (select case relreplident when 'f' then 'FULL' else 'default' end
      from pg_class where relname='orders' and relnamespace='public'::regnamespace),
  'storage_buckets', (select coalesce(json_agg(id order by id),'[]') from storage.buckets),
  'functions', (select coalesce(json_agg(proname order by proname),'[]')
      from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public')
) as snapshot;
```
