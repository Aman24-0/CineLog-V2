-- ============================================================================
-- CineLog V2 — Public Profile Lookup Functions
-- ----------------------------------------------------------------------------
-- Adds two SECURITY DEFINER functions that the public profile route
-- (/u/[username]) uses to safely read another user's profile + vault items
-- WITHOUT weakening the existing RLS policies on `profiles` or `vault`.
--
-- Background
-- ----------
-- The `profiles` table's RLS policy `profiles_select_own` restricts SELECT
-- to rows where `id = auth.uid()`. This is intentional — it prevents
-- user enumeration. But it also blocks the public profile route from
-- loading another user's profile by username, even when that user has
-- opted into `is_public = true`.
--
-- The `vault` table has the same shape of RLS (`user_id = auth.uid()`).
--
-- Solution
-- --------
-- Two SECURITY DEFINER functions that:
--   • `get_public_profile_by_username(p_username text)` — returns the
--     profile row only when `is_public = true AND deleted_at IS NULL`.
--     Callable by `anon` AND `authenticated` (so logged-out viewers can
--     open shared links). Never returns soft-deleted or private profiles.
--   • `get_public_vault_by_user(p_user_id uuid)` — returns the user's
--     non-deleted vault items only when their profile is public. Callable
--     by `anon` AND `authenticated`.
--
-- Safety
-- ------
--   • SECURITY DEFINER is safe because:
--       - Both functions are owned by the postgres role (server-side).
--       - Both filter by `is_public = true AND deleted_at IS NULL` —
--         private profiles + soft-deleted rows are invisible.
--       - They return only PUBLIC profile/vault fields (no email, no
--         preferences, no admin flags, no deleted_at).
--       - They accept only a single scalar parameter (username or uid).
--   • Mirrors the existing `is_username_available` pattern in
--     `06_fix_username_availability.sql`.
--
-- Idempotent — re-running is safe (CREATE OR REPLACE FUNCTION, plus
-- idempotent GRANT / REVOKE).
-- ============================================================================


-- ─── 1. get_public_profile_by_username(text) ───────────────────────────────
--
-- Returns the public-facing columns of a profile row when the profile is
-- public + not soft-deleted. Returns no rows otherwise.
--
-- Columns exposed (intentionally minimal — NO email, NO admin flags, NO
-- preferences, NO deleted_at):
--   id, username, display_name, bio, avatar_url, banner_url, banner_type,
--   favorite_movie_id, favorite_series_id, favorite_director_id,
--   social_links, is_public, created_at

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id                    uuid,
  username              text,
  display_name          text,
  bio                   text,
  avatar_url            text,
  banner_url            text,
  banner_type           text,
  favorite_movie_id     text,
  favorite_series_id    text,
  favorite_director_id  text,
  social_links          jsonb,
  is_public             boolean,
  created_at            timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.banner_url,
    p.banner_type,
    p.favorite_movie_id,
    p.favorite_series_id,
    p.favorite_director_id,
    p.social_links,
    p.is_public,
    p.created_at
  FROM public.profiles p
  WHERE p.username = LOWER(p_username)
    AND p.is_public = TRUE
    AND p.deleted_at IS NULL
$$;

-- Both anon (logged-out share viewers) AND authenticated users can call.
REVOKE EXECUTE ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated, anon;

COMMENT ON FUNCTION public.get_public_profile_by_username(text) IS
  'Returns the public-facing columns of a profile row when is_public = true AND deleted_at IS NULL. Bypasses RLS via SECURITY DEFINER so the /u/[username] route can render shared profiles for both logged-in and logged-out viewers. Never returns private or soft-deleted profiles.';


-- ─── 2. get_public_vault_by_user(uuid) ─────────────────────────────────────
--
-- Returns the public-facing vault rows for a user whose profile is public.
-- Used by the public profile route's Activity Feed + Favorites tab.
--
-- The vault table has many columns — we expose only the public-safe,
-- non-PII subset that the ActivityFeed + FavoritesGrid components need.
--
-- Columns exposed:
--   id, user_id, tmdb_id, media_type, status, is_favorite, is_pinned,
--   rating, notes, rewatch_count, progress_minutes, watched_on,
--   started_at, completed_at, last_activity_at, created_at, updated_at,
--   season_dates, season_rewatch_count, season_rewatch_dates

CREATE OR REPLACE FUNCTION public.get_public_vault_by_user(p_user_id uuid)
RETURNS TABLE (
  id                      text,
  user_id                 uuid,
  tmdb_id                 integer,
  media_type              text,
  status                  text,
  is_favorite             boolean,
  is_pinned               boolean,
  rating                  integer,
  notes                   text,
  rewatch_count           integer,
  progress_minutes        integer,
  watched_on              text,
  started_at              timestamptz,
  completed_at            timestamptz,
  last_activity_at        timestamptz,
  created_at              timestamptz,
  updated_at              timestamptz,
  season_dates            jsonb,
  season_rewatch_count    integer,
  season_rewatch_dates    jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id::text,
    v.user_id,
    v.tmdb_id,
    v.media_type::text,
    v.status::text,
    v.is_favorite,
    v.is_pinned,
    v.rating::integer,
    v.notes,
    v.rewatch_count,
    v.progress_minutes,
    v.watched_on,
    v.started_at,
    v.completed_at,
    v.last_activity_at,
    v.created_at,
    v.updated_at,
    v.season_dates,
    v.season_rewatch_count,
    v.season_rewatch_dates
  FROM public.vault v
  JOIN public.profiles p ON p.id = v.user_id
  WHERE v.user_id = p_user_id
    AND v.deleted_at IS NULL
    AND p.is_public = TRUE
    AND p.deleted_at IS NULL
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_vault_by_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_vault_by_user(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.get_public_vault_by_user(uuid) IS
  'Returns the non-deleted vault rows for a user whose profile is public. Bypasses RLS via SECURITY DEFINER so the /u/[username] route can populate Activity + Favorites tabs for shared profiles. Joins profiles to enforce is_public = true at query time (defense in depth — even if the profile is flipped to private mid-session, the vault rows stop being returned).';
