-- 20260903_episode_release_tracking.sql
--
-- New Episode / New Season Detection + Push Notifications
--
-- Adds:
--   1. vault.has_new_release column — boolean flag for the NEW badge.
--   2. episode_release_log table — dedup + notification state tracking.
--   3. claim_episode_release() RPC — ATOMIC claim so concurrent cron
--      runs cannot both send the same push.
--   4. schedule_episode_releases() function + pg_cron job.
--
-- MIGRATION FIX HISTORY
-- ---------------------
-- v1: `user_id text REFERENCES auth.users(id)` — type mismatch (text vs uuid).
-- v2: `user_id uuid REFERENCES profiles(id)` — correct FK, BUT the function
--      body used `$$ ... $$` while the inner `format()` call also used `$$ ... $$`.
--      The inner `$$` terminated the outer function body early →
--      `ERROR: 42601 syntax error at or near "SELECT" LINE 159`.
-- v3 (THIS VERSION):
--      • Function body uses `$function$` tag.
--      • Inner format() uses `$cmd$` tag (matching weekly_recap pattern).
--      • Adds claim_episode_release() RPC for TRUE atomic claim semantics
--        so two concurrent cron runs cannot both send the same push.
--      • Idempotent — safe to re-run if a previous attempt partially applied.
--
-- All dollar-quote tags used in this file:
--   $$                — DO blocks (only contain regular SQL, no nested $$)
--   $function$        — CREATE FUNCTION bodies
--   $cmd$             — inner format() string inside CREATE FUNCTION
--   $claim_fn$        — claim_episode_release() body (no nested strings)

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
--   pending  → row created, push not yet attempted
--   sent     → push was successfully delivered (sent > 0)
--   failed   → push was attempted but failed (can be retried)
--   skipped  → push was skipped (anti-spam for older episodes; user opt-out)
--
-- Atomic claim semantics:
--   Only one worker may transition a row from pending→sent/failed.
--   The claim_episode_release() RPC does this atomically using
--   UPDATE ... WHERE notification_status = 'pending' RETURNING.
--   A concurrent worker that finds no row to claim knows another
--   worker is already processing (or has already processed) the episode
--   and must NOT send its own push.

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
      claimed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT episode_release_log_user_episode_unique
        UNIQUE (user_id, tmdb_id, season_number, episode_number),
      CONSTRAINT episode_release_log_status_check
        CHECK (notification_status IN ('pending', 'sent', 'failed', 'skipped'))
    );
  ELSE
    -- Table exists from partial run — add missing columns/constraints idempotently.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'episode_release_log'
      AND column_name = 'notification_status'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD COLUMN notification_status text NOT NULL DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'episode_release_log'
      AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;

    -- v3: add claimed_at for atomic claim RPC (idempotent)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'episode_release_log'
      AND column_name = 'claimed_at'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD COLUMN claimed_at timestamptz;
    END IF;

    -- Ensure status check constraint exists (added in v2)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'episode_release_log_status_check'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD CONSTRAINT episode_release_log_status_check
        CHECK (notification_status IN ('pending', 'sent', 'failed', 'skipped'));
    END IF;

    -- Ensure UNIQUE constraint exists (added in v1)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'episode_release_log_user_episode_unique'
    ) THEN
      ALTER TABLE public.episode_release_log
        ADD CONSTRAINT episode_release_log_user_episode_unique
        UNIQUE (user_id, tmdb_id, season_number, episode_number);
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

-- Index for the atomic claim RPC (user+show+episode lookup)
CREATE INDEX IF NOT EXISTS episode_release_log_claim_idx
  ON public.episode_release_log (user_id, tmdb_id, season_number, episode_number)
  WHERE notification_status = 'pending';

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
  'Dedup + notification state tracking for episode release notifications. Each row represents one episode release detection. notification_status tracks whether the push was sent, failed, or skipped. claimed_at is used by the claim_episode_release() RPC for atomic concurrent-worker claim.';

-- ═══════════════════════════════════════════════════════════════════
-- 3. claim_episode_release — ATOMIC claim RPC
-- ═══════════════════════════════════════════════════════════════════
--
-- Atomically claim a pending episode_release_log row for notification
-- sending. Returns the claimed row, or NULL if another worker already
-- claimed it (or it was already sent/skipped).
--
-- This is the SINGLE concurrency guarantee: for a given
-- (user_id, tmdb_id, season_number, episode_number), at most ONE worker
-- can ever receive a non-NULL return. All concurrent workers receive NULL
-- and MUST NOT send a push.
--
-- Implementation:
--   UPDATE ... WHERE notification_status = 'pending'
--   SET claimed_at = now()
--   RETURNING ...
-- The UPDATE is atomic — Postgres takes a row lock, evaluates the WHERE
-- clause, and commits the change in one statement. Two concurrent UPDATEs
-- on the same row are serialized by the row lock; the second one sees
-- the row already has claimed_at set / status no longer 'pending' (depending
-- on exact timing) — either way, the second UPDATE affects 0 rows and
-- returns nothing.
--
-- The function also handles a stale-claim recovery case: if a previous
-- worker died after claiming but before sending (claimed_at set,
-- status still 'pending', older than 15 min), a new worker may re-claim.
--
-- Returns: the claimed row, or no rows.

CREATE OR REPLACE FUNCTION public.claim_episode_release(
  p_user_id uuid,
  p_tmdb_id bigint,
  p_season_number integer,
  p_episode_number integer
)
RETURNS SETOF public.episode_release_log
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $claim_fn$
  UPDATE public.episode_release_log
  SET claimed_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND tmdb_id = p_tmdb_id
    AND season_number = p_season_number
    AND episode_number = p_episode_number
    AND notification_status = 'pending'
    AND (
      claimed_at IS NULL
      OR claimed_at < now() - interval '15 minutes'
    )
  RETURNING *;
$claim_fn$;

REVOKE ALL ON FUNCTION public.claim_episode_release(uuid, bigint, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_episode_release(uuid, bigint, integer, integer)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Cron schedule for episode release detection
-- ═══════════════════════════════════════════════════════════════════
--
-- Follows the EXACT same pattern as the existing release-reminders
-- and weekly-recap cron schedulers:
--   - Uses pg_cron + pg_net
--   - Reads app.app_url and app.cron_secret from Postgres GUC settings
--   - Safely skips if settings aren't configured (no hardcoded URLs)
--   - Runs every 6 hours (4x daily) to catch new episode releases
--   - Function is SECURITY DEFINER, callable only by service_role
--
-- Dollar-quote tags:
--   Outer function body:  $function$  (NOT $$, to avoid collision with inner $cmd$)
--   Inner format string:  $cmd$       (matches weekly_recap migration pattern)

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.schedule_episode_releases(
  p_app_url TEXT,
  p_cron_secret TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_job_id BIGINT;
  v_endpoint TEXT;
  v_headers JSONB;
  v_command TEXT;
BEGIN
  IF p_app_url IS NULL OR p_app_url !~ '^https://[^/]+/?$' THEN
    RAISE EXCEPTION 'p_app_url must be a single HTTPS origin';
  END IF;
  IF p_cron_secret IS NULL OR char_length(p_cron_secret) < 16 THEN
    RAISE EXCEPTION 'p_cron_secret must be at least 16 characters';
  END IF;

  v_endpoint := rtrim(p_app_url, '/') || '/api/cron/episode-releases';
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', p_cron_secret
  );
  v_command := format(
    $cmd$
      SELECT net.http_post(
        url := '%s',
        headers := '%s'::jsonb,
        body := '{}'::jsonb
      );
    $cmd$,
    v_endpoint,
    v_headers::TEXT
  );

  -- Unschedule existing job if present (idempotent re-run)
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'episode_releases'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  RETURN cron.schedule(
    'episode_releases',
    '0 */6 * * *',
    v_command
  );
END;
$function$;

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
    RAISE NOTICE 'episode_releases cron job NOT activated — app.app_url and/or app.cron_secret GUC settings are not configured. To activate, run: SELECT public.schedule_episode_releases(''https://your-app.vercel.app'', ''your-strong-cron-secret'');';
  END IF;
END $$;
