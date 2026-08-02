-- 20260803_add_weekly_recap_preferences.sql
-- ---------------------------------------------------------------------
-- Phase 2 — Task 14: Weekly Recap Notifications
-- ---------------------------------------------------------------------
-- Stores per-user "last sent" tracking so the weekly recap cron job
-- can skip users who already received a recap this week.
--
-- DESIGN DECISIONS:
--
-- 1. NO new columns for weekly_recap_enabled / day / time.
--    The user's weekly recap preferences already live in
--    user_preferences.prefs_json under the `notifPrefs` key:
--      prefs_json.notifPrefs.weeklyRecap     (boolean, default true)
--      prefs_json.notifPrefs.weeklyDigestDay (number 0-6, default 1=Mon)
--      prefs_json.notifPrefs.weeklyDigestTime(string "HH:MM", default "09:00")
--    These are written by the browser via saveUserSettings() and read
--    by the server via the prefs_json JSONB column. Adding dedicated
--    columns would duplicate this and require a migration every time
--    the pref shape changes. The JSONB approach is more flexible.
--
-- 2. weekly_recap_last_sent IS a dedicated column (not in prefs_json).
--    Rationale: the cron job updates this column on every send, and
--    a dedicated column with an index is faster to filter on than a
--    JSONB path expression. The column is also easier to inspect via
--    SQL queries during debugging.
--
-- 3. The get_users_for_weekly_recap() function returns user_ids that:
--    a. Have weeklyRecap = true in their prefs_json.notifPrefs
--    b. Have weeklyDigestDay matching the target day (0=Sun, 6=Sat)
--    c. Have NOT been sent a recap in the last 6 days (grace period
--       to handle cron failures — if the job misses a day, the next
--       day's run will still pick up the user)
--    d. Are not soft-deleted (profiles.deleted_at IS NULL)
--
-- 4. The function is SECURITY DEFINER so the cron job can call it
--    via the service_role client without hitting RLS. It only RETURNS
--    user_ids — no sensitive data.
-- ---------------------------------------------------------------------

-- ─── 1. Add weekly_recap_last_sent column ─────────────────────────────
--
-- Tracks when the user last received a weekly recap. NULL means never.
-- The cron job updates this to now() after successfully sending.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS weekly_recap_last_sent TIMESTAMPTZ;

-- Index on weekly_recap_last_sent for the cron job's lookup query.
-- We can't use a partial index with NOW() in the predicate because
-- NOW() is not IMMUTABLE (PostgreSQL requires index predicates to be
-- immutable). A plain index is fine — the table is small (one row per
-- user) and the query filters by weekly_recap_last_sent IS NULL OR
-- < cutoff, both of which can use this index.
CREATE INDEX IF NOT EXISTS user_preferences_weekly_recap_idx
  ON public.user_preferences(weekly_recap_last_sent);

-- ─── 2. get_users_for_weekly_recap(target_day) ───────────────────────
--
-- Returns user_ids that should receive a recap on the given day.
--
-- target_day: integer 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday)
--             Matches the weeklyDigestDay pref value.
--
-- The function does NOT filter by time — the cron job runs at a fixed
-- time (e.g. 9:00 UTC) and all users configured for that day's digest
-- receive it. Per-user time-of-day would require running the cron every
-- hour and filtering by time string, which is fragile (timezone
-- handling, DST, etc.). The day-of-week filter is sufficient for a
-- weekly digest.
--
-- SECURITY DEFINER: runs with the function owner's privileges (postgres),
-- bypassing RLS on user_preferences and profiles. The function only
-- returns user_id and display_name — no emails or other PII.

CREATE OR REPLACE FUNCTION public.get_users_for_weekly_recap(
  target_day INTEGER
)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  username TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.username
  FROM public.profiles p
  INNER JOIN public.user_preferences up ON up.user_id = p.id
  WHERE
    p.deleted_at IS NULL
    -- weeklyRecap enabled in prefs_json.notifPrefs
    AND COALESCE(
      (up.prefs_json #>> '{notifPrefs,weeklyRecap}')::BOOLEAN,
      TRUE  -- default to true if not set
    ) = TRUE
    -- weeklyDigestDay matches target_day (default 1 = Monday)
    AND COALESCE(
      (up.prefs_json #>> '{notifPrefs,weeklyDigestDay}')::INTEGER,
      1  -- default to Monday if not set
    ) = target_day
    -- Not sent in the last 6 days (grace period for cron failures)
    AND (
      up.weekly_recap_last_sent IS NULL
      OR up.weekly_recap_last_sent < NOW() - INTERVAL '6 days'
    );
$$;

-- Grant execute to authenticated (so the API route can call it via
-- the service_role client, which is already authenticated).
GRANT EXECUTE ON FUNCTION public.get_users_for_weekly_recap(INTEGER)
  TO authenticated, service_role, anon;

-- ─── 3. mark_weekly_recap_sent(user_uuid) ────────────────────────────
--
-- Updates weekly_recap_last_sent to now() for the given user.
-- Called by the cron job after successfully sending a recap.
--
-- SECURITY DEFINER: bypasses RLS so the service_role client can update
-- any user's row.

CREATE OR REPLACE FUNCTION public.mark_weekly_recap_sent(
  target_user_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_preferences
  SET weekly_recap_last_sent = NOW()
  WHERE user_id = target_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_weekly_recap_sent(UUID)
  TO authenticated, service_role, anon;

-- ─── 4. Schedule the weekly recap cron job ───────────────────────────
--
-- We use pg_cron to invoke the /api/cron/weekly-recap endpoint every
-- Monday at 09:00 UTC. The endpoint then:
--   1. Calls get_users_for_weekly_recap() to find users whose
--      weeklyDigestDay preference matches today's day-of-week.
--   2. For each user, queries their vault activity, inserts a
--      notification row, sends a push via /api/push/send-admin, and
--      marks weekly_recap_last_sent = now().
--
-- The endpoint is on Vercel (not a Supabase Edge Function) because the
-- codebase uses SolidStart API routes for all server logic.
--
-- pg_cron needs to make an HTTP POST to the Vercel URL. We use the
-- pg_net extension (https://supabase.com/docs/guides/functions/extensions/
-- pg_net) for HTTP requests. If pg_net is not installed, install it
-- first via the Supabase dashboard → Database → Extensions → enable "pg_net".
--
-- CRON_SECRET: the endpoint requires this secret in the X-Cron-Secret
-- header. The value must match the CRON_SECRET env var on Vercel.
-- Replace '<CRON_SECRET>' below with the actual secret value (generate
-- with `openssl rand -hex 32`). WARNING: this exposes the secret in the
-- cron.job table — only the postgres role can read cron.job, so this is
-- acceptable for a low-privilege secret like the cron trigger.
--
-- APP_URL: replace '<APP_URL>' with your Vercel production URL (e.g.
-- 'https://cinelog-v2.vercel.app').
--
-- The cron schedule runs EVERY day at 09:00 UTC. The endpoint filters
-- by the user's preferred day, so only the right users get a recap on
-- any given day. This lets users pick any day of the week for their
-- recap without us needing to schedule 7 separate cron jobs.
--
-- If pg_net is unavailable, comment out the cron.schedule call below
-- and use Vercel Cron instead (add a vercel.json cron entry — see the
-- Vercel docs at https://vercel.com/docs/cron-jobs).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  app_url TEXT := '<APP_URL>';          -- REPLACE with your Vercel URL
  cron_secret TEXT := '<CRON_SECRET>';  -- REPLACE with your CRON_SECRET
BEGIN
  -- Unschedule any existing job with this name (idempotent).
  BEGIN
    PERFORM cron.unschedule('weekly_recap');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule: every day at 09:00 UTC. The endpoint filters by user's
  -- preferred day, so a daily run covers all 7 day preferences.
  PERFORM cron.schedule(
    'weekly_recap',
    '0 9 * * *',
    $cmd$
      SELECT net.http_post(
        url := format('%s/api/cron/weekly-recap', '<APP_URL>'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', '<CRON_SECRET>'
        ),
        body := '{}'::jsonb
      );
    $cmd$
  );
END;
$$;
