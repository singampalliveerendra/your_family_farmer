-- Forgot-password OTP sessions (2factor.in).
-- One row per OTP request. After the OTP is verified we stash a short-lived
-- reset_token on the same row; the reset-password-otp endpoint trades that
-- token for a password change.

CREATE TABLE IF NOT EXISTS otp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(15) NOT NULL,
  session_id text NOT NULL,                       -- 2factor session id
  purpose text DEFAULT 'forgot_password',
  user_type text,                                 -- 'farmer' | 'consumer' | 'rider'
  reset_token text,                               -- issued after OTP verified
  reset_token_expires_at timestamptz,             -- reset token TTL (15 min)
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '10 minutes',
  used boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone ON otp_sessions (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_sessions_reset_token ON otp_sessions (reset_token);

-- All access is via the service-role key in API routes, so lock the table to
-- everyone else.
ALTER TABLE otp_sessions ENABLE ROW LEVEL SECURITY;
