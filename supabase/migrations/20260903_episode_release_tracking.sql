-- 20260903_episode_release_tracking.sql
--
-- New Episode / New Season Detection + Push Notifications
--
-- Adds:
--   1. vault.has_new_release column — boolean flag for the NEW badge.
--      Set to true when a completed title is auto-reactivated to watching
--      because a new season's first episode was detected as released.
--      Cleared when the user opens the title's details page.
--
--   2. episode_release_log table — dedup table ensuring each
--      (user_id, tmdb_id, season_number, episode_number) combination
--      generates at most ONE notification per user. Prevents duplicate
--      notifications across multiple cron runs or metadata refreshes.
--
-- The cron job at /api/cron/episode-releases checks for newly released
-- episodes and uses this table to avoid re-notifying.

-- vault.has_new_release — NEW badge flag
ALTER TABLE public.vault
  ADD COLUMN IF NOT EXISTS has_new_release boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vault.has_new_release IS
  'True when a new season/episode was detected after the title was completed. Cleared when the user opens the details page.';

-- episode_release_log — dedup table for episode release notifications
CREATE TABLE IF NOT EXISTS public.episode_release_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id bigint NOT NULL,
  media_type text NOT NULL DEFAULT 'tv',
  season_number integer NOT NULL,
  episode_number integer NOT NULL,
  episode_air_date date,
  title_name text,
  notified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Unique constraint: one notification per user per episode
  CONSTRAINT episode_release_log_user_episode_unique
    UNIQUE (user_id, tmdb_id, season_number, episode_number)
);

-- Index for the cron job's lookup: find all vault TV items for a user
CREATE INDEX IF NOT EXISTS episode_release_log_user_tmdb_idx
  ON public.episode_release_log (user_id, tmdb_id);

-- RLS: users can only see their own release logs
ALTER TABLE public.episode_release_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY episode_release_log_select_own
  ON public.episode_release_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by the cron job)

COMMENT ON TABLE public.episode_release_log IS
  'Dedup table for episode release notifications. Each row represents one notification sent for a specific episode release. The unique constraint ensures at most one notification per user per episode.';
