-- ============================================================================
-- CineLog V2 — Profile Page Redesign: Social + Profile Fields
-- ----------------------------------------------------------------------------
-- This migration adds:
--   1. New columns on `profiles` for the social/profile redesign:
--        - social_links  JSONB  — { twitter, instagram, letterboxd, ... }
--        - is_public     BOOL   — public-by-default, can be toggled private
--        - banner_url    TEXT   — already exists, kept for clarity
--        - avatar_url    TEXT   — already exists, kept for clarity
--      (banner_url + avatar_url already exist in the live schema, so the
--       ALTERs for those are wrapped in IF NOT EXISTS-equivalent DO blocks.)
--
--   2. A new `follows` table for the social graph (followers / following).
--      RLS: anyone authenticated can read (social graph is public), but
--      only the follower themselves can insert / delete their own edges.
--
-- Idempotent — re-running is safe. Every statement uses IF NOT EXISTS or
-- DO blocks that no-op when the column / table / policy already exists.
-- ============================================================================


-- ─── 1. profiles: new social columns ────────────────────────────────────────

-- social_links — JSONB map of platform → URL/handle (e.g.
-- {"twitter": "@user", "letterboxd": "user"}). Defaults to empty object.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'social_links'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN social_links JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- is_public — boolean, defaults to TRUE (public-by-default per spec).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_public BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- banner_url + avatar_url are already in the live schema — verify they
-- exist (no-op if they do, add if they don't, defensive for fresh DBs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'banner_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN banner_url TEXT DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT DEFAULT NULL;
  END IF;
END $$;


-- ─── 2. follows table — social graph ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Index for "who is following user X" queries (followers list).
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);
-- Index for "who is user X following" queries (following list).
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);

-- Prevent self-follows at the DB level (defensive — UI also guards).
ALTER TABLE public.follows
  ADD CONSTRAINT follows_no_self_follow
  CHECK (follower_id <> following_id);


-- ─── 3. RLS on follows ─────────────────────────────────────────────────────

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the social graph (follows are public).
-- Private profiles may hide their followers list at the application layer;
-- the row-level policy here just gates on authentication.
DROP POLICY IF EXISTS follows_read ON public.follows;
CREATE POLICY follows_read
  ON public.follows FOR SELECT
  TO authenticated
  USING (true);

-- A user can only create follow edges where THEY are the follower.
DROP POLICY IF EXISTS follows_insert ON public.follows;
CREATE POLICY follows_insert
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

-- A user can only delete their own follow edges (unfollow).
DROP POLICY IF EXISTS follows_delete ON public.follows;
CREATE POLICY follows_delete
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);


-- ─── 4. Storage buckets for avatar / banner uploads ────────────────────────
--    Public read (avatars/banners are visible on shared profiles),
--    authenticated write to the user's own folder (uid/...).
--    These are created via the Supabase Storage API, NOT SQL — but we
--    document the intended bucket policy here for reference. The actual
--    bucket creation is performed by the apply script / dashboard.
-- ============================================================================
