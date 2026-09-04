-- 20260903_episode_release_tracking.sql
--
-- New Episode / New Season Detection + Push Notifications
--
-- Adds:
--   1. vault.has_new_release column — boolean flag for the NEW badge.
--   2. episode_release_log table — dedup + notification state tracking.
--
-- MIGRATION FIX (2026-09-03 hardening):
--   The original version of this migration used `user_id text REFERENCES auth.users(id)`
--   which fails with a type mismatch (text vs uuid). The fix uses `user_id UUID` with
--   a FK to `profiles(id)` — matching the existing convention used by push_subscriptions,
--   user_reminders, notifications, and all other user-owned tables.
--
--   The episode_release_log table also now has a `notification_status` column
--   (pending/sent/failed) so that a failed push doesn't permanently suppress
--   a notification. The cron job can retry failed entries.
--
--   This migration is IDEMPOTENT — safe to re-run if a previous attempt
--   partially applied. Uses IF NOT EXISTS / DO blocks throughout.

-- ═══════════════════════════════════════════════════════════════════
-- 1. vault.has_new_release
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.vault
  ADD COLUMN IF NOT EXISTS has_new_release boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vault.has_new_release IS
  'True when a new season/episode was detected after the title was completed. Cleared when the user opens the details page.';

-- ═══════════════════════════════════════════════════════════════════
-- 2. episode_release_log — dedup + notification state tracking
-- ═══════════════════════════════════════════════════════════════════
--
-- notification_status lifecycle:
--   pending  → record inserted, push not yet attempted
--   sent     → push was successfully delivered (sent > 0)
--   failed   → push was attempted but failed (can be retried)
--   skipped  → push was skipped (user opted out of category, no subscription, etc.)
--
-- The UNIQUE constraint on (user_id, tmdb_id, season_number, episode_number)
-- ensures at most one record per episode per user. The cron job uses
-- upsert with ON CONFLICT to atomically insert-or-update the status.

DO $$
BEGIN
  -- Check if the table already exists (from a partial previous run)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'episode_release_log'
  ) THEN
    CREATE TABLE public.episode_release_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      tmdb_id bigint NOT NULL,
      media_type text NOT NULL DEFAULT 'tv',
      season_number integer NOT NULL,
      episode_number integer NOT NULL,
      episode_air_date date,
      title_name text,
      notification_status text NOT NULL DEFAULT 'pending',
      notified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT episode_release_log_user_episode_unique
        UNIQUE (user_id, tmdb_id, season_number, episode_number),
      CONSTRAINT episode_release_log_status_check
        CHECK (notification_status IN ('pending', 'sent', 'failed', 'skipped'))
    );
  ELSE
    -- Table exists from partial run — add missing columns if needed
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'episode_release_log'
      AND column_name = 'notification_status'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD COLUMN notification_status text NOT NULL DEFAULT 'pending';
      ALTER TABLE public.episode_release_log
        ADD CONSTRAINT episode_release_log_status_check
        CHECK (notification_status IN ('pending', 'sent', 'failed', 'skipped'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'episode_release_log'
      AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;
  END IF;
END $$;

-- Index for the cron job's lookup: find all logs for a user+show
CREATE INDEX IF NOT EXISTS episode_release_log_user_tmdb_idx
  ON public.episode_release_log (user_id, tmdb_id);

-- Index for finding failed/pending entries to retry
CREATE INDEX IF NOT EXISTS episode_release_log_retry_idx
  ON public.episode_release_log (notification_status)
  WHERE notification_status IN ('pending', 'failed');

-- RLS: users can only see their own release logs (service role bypasses)
ALTER TABLE public.episode_release_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists from a partial run, then recreate
DROP POLICY IF EXISTS episode_release_log_select_own
  ON public.episode_release_log;

CREATE POLICY episode_release_log_select_own
  ON public.episode_release_log
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.episode_release_log IS
  'Dedup + notification state tracking for episode release notifications. Each row represents one episode release detection. notification_status tracks whether the push was sent, failed, or skipped.';

-- ═══════════════════════════════════════════════════════════════════
-- 3. Cron schedule for episode release detection
-- ═══════════════════════════════════════════════════════════════════
--
-- Follows the EXACT same pattern as the existing release-reminders
-- and weekly-recap cron schedulers:
--   - Uses pg_cron + pg_net
--   - Reads app.app_url and app.cron_secret from Postgres GUC settings
--   - Safely skips if settings aren't configured (no hardcoded URLs)
--   - Runs every 6 hours (4x daily) to catch new episode releases
--   - Function is SECURITY DEFINER, callable only by service_role

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.schedule_episode_releases(
  p_app_url TEXT,
  p_cron_secret TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_command TEXT;
BEGIN
  -- Unschedule existing job if present (idempotent re-run)
  BEGIN
    PERFORM cron.unschedule('episode_releases');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist yet — ignore
  END;

  IF p_app_url IS NULL OR p_cron_secret IS NULL THEN
    RAISE NOTICE 'schedule_episode_releases: app_url or cron_secret is NULL — skipping schedule creation. Configure with: SELECT schedule_episode_releases(''https://yourapp.com'', ''your-secret'');';
    RETURN;
  END IF;

  v_command := format(
    $$SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', %L
      ),
      body := '{}'::jsonb
    )$$,
    p_app_url || '/api/cron/episode-releases',
    p_cron_secret
  );

  -- Every 6 hours: 0 */6 * * *
  PERFORM cron.schedule(
    'episode_releases',
    '0 */6 * * *',
    v_command
  );

  RAISE NOTICE 'episode_releases cron job scheduled every 6 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_episode_releases(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_episode_releases(TEXT, TEXT)
  TO service_role;

-- Safe automatic activation when operator has configured the GUC settings.
-- Follows the same pattern as release_reminders and weekly_recap schedulers.
DO $$
DECLARE
  v_app_url TEXT := current_setting('app.app_url', TRUE);
  v_cron_secret TEXT := current_setting('app.cron_secret', TRUE);
BEGIN
  IF v_app_url IS NOT NULL AND v_cron_secret IS NOT NULL THEN
    PERFORM public.schedule_episode_releases(v_app_url, v_cron_secret);
    RAISE NOTICE 'episode_releases cron job activated from GUC settings';
  ELSE
    RAISE NOTICE 'episode_releases cron job NOT activated — configure app.app_url and app.cron_secret settings, then run: SELECT schedule_episode_releases(current_setting(''app.app_url''), current_setting(''app.cron_secret''));';
  END IF;
END $$;
