-- ================================================================
-- YFF — Guest checkout
-- Lets a buyer place an order without an account, providing name,
-- email, mobile, and address at checkout. consumer_id stays NULL for
-- guest orders (the column is already nullable — see
-- orders-consumer-id-migration.sql).
-- ================================================================

-- Buyer email, captured only for guest checkout (registered accounts
-- don't have an email on file). NULL for account orders.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS buyer_email text;
