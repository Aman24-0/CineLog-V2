-- 03_profile_banner_system.sql
-- Complete banner system for the Profile page.
--
-- Adds banner_type column to track how the banner is sourced:
--   'favorite_movie' — auto from favorite movie backdrop (DEFAULT)
--   'default'        — CineLog gradient
--   'url'            — custom image URL (stored in banner_url)
--   'upload'         — uploaded image (stored in banner_url as data URI or Supabase Storage URL)
--
-- The existing banner_override_path column is kept for backward
-- compatibility but is superseded by banner_type + banner_url.
--
-- Migration safety:
--   • banner_type defaults to 'favorite_movie' so existing users
--     automatically continue using their favorite movie backdrop.
--   • All columns are nullable / have defaults — no breaking changes.
--   • RLS: No new policies needed (same table, same RLS).

-- Banner type enum check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'banner_type'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN banner_type text NOT NULL DEFAULT 'favorite_movie'
      CHECK (banner_type IN ('upload', 'url', 'favorite_movie', 'default'));
  END IF;
END $$;

-- Banner URL — stores the image URL for 'upload' and 'url' banner types.
-- For 'upload', this will be a Supabase Storage public URL.
-- For 'url', this will be the user-pasted URL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'banner_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN banner_url text;
  END IF;
END $$;

COMMENT ON COLUMN profiles.banner_type IS 'How the profile banner is sourced: upload | url | favorite_movie | default. Defaults to favorite_movie.';
COMMENT ON COLUMN profiles.banner_url IS 'Image URL for upload/url banner types. Null for favorite_movie/default.';
