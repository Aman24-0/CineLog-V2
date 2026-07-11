-- 04_profile_display_name_initialized.sql
-- Adds display_name_initialized column to prevent overwriting user-edited names.
--
-- When a user signs in for the first time, ensureProfile() auto-populates
-- display_name from Google metadata or email. Once set, display_name_initialized
-- is set to true. On subsequent logins, ensureProfile() checks this flag and
-- NEVER overwrites the display_name — even if it was auto-generated.
--
-- This also enables one-time migration of existing users whose display_name
-- is still "CineLog User" (the trigger default).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'display_name_initialized'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN display_name_initialized boolean NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN profiles.display_name_initialized IS 'True once display_name has been auto-populated or manually edited. Prevents ensureProfile from overwriting user-chosen names.';
