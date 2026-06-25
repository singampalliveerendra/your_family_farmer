-- Adds soil_ph to farmers so the value shown in the Quality tab of the public
-- farmer profile can actually be entered (farmer dashboard → Edit profile, and
-- the moderator farmer form). Safe to run multiple times.
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS soil_ph numeric;
