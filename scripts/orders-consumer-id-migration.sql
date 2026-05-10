-- ================================================================
-- YFF — Link orders to authenticated consumer accounts
-- Run AFTER consumer-auth-migration.sql
-- ================================================================

-- 1. Foreign key — orders placed by registered consumers carry their account id.
--    Older anonymous orders keep consumer_id = NULL. Account deletion sets to NULL
--    so we never lose the order history a farmer needs.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS consumer_id uuid REFERENCES consumers_auth(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_consumer_id ON orders(consumer_id);
