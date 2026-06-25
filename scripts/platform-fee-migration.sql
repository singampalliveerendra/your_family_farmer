-- Card: moderator-set commission / platform fee, added on top of the consumer's
-- order total and shown as a "Platform fee". Single global setting (one row),
-- plus a per-order stamp so each order records the fee that applied. Idempotent.

-- Global setting: one row (id = 1). fee_percent is a percentage, e.g. 5 = 5%.
CREATE TABLE IF NOT EXISTS platform_settings (
  id          int PRIMARY KEY DEFAULT 1,
  fee_percent numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id = 1)
);
INSERT INTO platform_settings (id, fee_percent) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- Per-order platform fee (rupees). Stamped once per cart batch (first row),
-- mirroring delivery_fee. 0 when no fee applies.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0;
