-- 02_profile_favorites.sql
-- Profile favorites + banner override fields for the Profile page.
--
-- Adds columns to the `profiles` table for:
--   • Favorite movie (TMDB id, text — TMDB ids are numeric but stored as
--     text to match the vault's `id` convention)
--   • Favorite series (TMDB id, text)
--   • Favorite director/auteur (TMDB person id, text)
--   • Favorite genre (genre name, text — e.g. "Sci-Fi")
--   • Banner override (optional TMDB backdrop path, text — e.g. "/abc.jpg")
--
-- All columns are nullable — a new user has no favorites set. The Profile
-- page shows empty-state CTAs for unset favorites.
--
-- RLS: No new policies needed. The existing `profiles` RLS policies
-- ("User can read/update own profile" — id = auth.uid()) cover these
-- columns automatically because they're on the same table.

-- Favorite movie — TMDB movie id as text (e.g. "693134")
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favorite_movie_id text;

-- Favorite series — TMDB tv id as text (e.g. "1396")
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favorite_series_id text;

-- Favorite director/auteur — TMDB person id as text (e.g. "525")
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favorite_director_id text;

-- Favorite genre — genre display name (e.g. "Sci-Fi", "Drama")
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favorite_genre text;

-- Banner override — optional TMDB backdrop path (e.g. "/abc.jpg").
-- When null, the Profile banner defaults to the favorite movie's backdrop,
-- then favorite series' backdrop, then an abstract gradient.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banner_override_path text;

-- Add a comment for the next developer who opens the table.
COMMENT ON COLUMN profiles.favorite_movie_id IS 'TMDB movie id (text) of the user''s favorite movie. Nullable — empty state CTA on Profile.';
COMMENT ON COLUMN profiles.favorite_series_id IS 'TMDB tv id (text) of the user''s favorite series. Nullable.';
COMMENT ON COLUMN profiles.favorite_director_id IS 'TMDB person id (text) of the user''s favorite director/auteur. Nullable.';
COMMENT ON COLUMN profiles.favorite_genre IS 'Genre display name (e.g. "Sci-Fi") of the user''s favorite genre. Nullable.';
COMMENT ON COLUMN profiles.banner_override_path IS 'Optional TMDB backdrop path for the Profile banner. When null, banner derives from favorite movie/series or falls back to gradient.';
