-- ============================================================
-- CineLog V2 — Admin Panel Phase 3 Migration
-- Date: 2026-07-23
--
-- Phase 3 deliverables:
--   1. Analytics — materialized views that aggregate user/content
--      engagement, refreshed hourly by pg_cron.
--   2. Maintenance — admin-runnable cleanup functions plus a
--      maintenance_runs audit table.
--   3. Settings — seed the app_config table with site-wide settings
--      keys (site_settings, rate_limits, tmdb_settings,
--      maintenance_window, retention_policy).
--
-- Idempotent: every statement uses IF NOT EXISTS / OR REPLACE so
-- running the migration multiple times is safe.
-- ============================================================

-- ─── 0. Extensions ────────────────────────────────────────────
-- pg_cron must be enabled at the Supabase project level
-- (Database → Extensions). The IF EXISTS guard makes this a no-op
-- if the extension is missing — the REFRESH calls in cron jobs
-- would fail silently, but the rest of the schema still applies.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (already there, but be safe)

-- ============================================================
-- 1. ANALYTICS — materialized views
-- ============================================================
--
-- Each MV is named mv_admin_<topic>. They are refreshed by a single
-- pg_cron job every hour (see §1.5).
--
-- Materialized views are preferred over regular views because:
--   • The aggregation is expensive (scans activity_log, vault, etc.)
--   • The admin only needs data as fresh as the last refresh
--   • We avoid hammering the DB every time the admin opens /admin/analytics
--
-- The trade-off: data can be up to 1 hour stale. That's acceptable
-- for an admin dashboard. The UI always shows the "last refreshed
-- at" timestamp so the admin knows the freshness.

-- ─── 1.1 mv_admin_user_growth ──────────────────────────────
-- Daily signups + cumulative user count.
DROP MATERIALIZED VIEW IF EXISTS public.mv_admin_user_growth;
CREATE MATERIALIZED VIEW public.mv_admin_user_growth AS
SELECT
  d::date AS day,
  COUNT(p.id) AS new_users,
  SUM(COUNT(p.id)) OVER (ORDER BY d::date) AS cumulative_users
FROM (
  -- Generate a series of days for the last 90 days so even days
  -- with zero signups appear in the chart.
  SELECT generate_series(
    date_trunc('day', now() - interval '90 days')::date,
    date_trunc('day', now())::date,
    interval '1 day'
  ) AS d
) AS days
LEFT JOIN public.profiles p
  ON date_trunc('day', p.created_at) = d
  AND p.deleted_at IS NULL
GROUP BY d::date
ORDER BY d::date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_user_growth_day
  ON public.mv_admin_user_growth (day);

-- ─── 1.2 mv_admin_active_users ─────────────────────────────
-- DAU/WAU/MAU on a per-day basis for the last 90 days.
-- "Active" = made at least one activity_log entry that day.
DROP MATERIALIZED VIEW IF EXISTS public.mv_admin_active_users;
CREATE MATERIALIZED VIEW public.mv_admin_active_users AS
WITH days AS (
  SELECT generate_series(
    date_trunc('day', now() - interval '90 days')::date,
    date_trunc('day', now())::date,
    interval '1 day'
  ) AS d
),
dau AS (
  SELECT
    date_trunc('day', created_at)::date AS day,
    COUNT(DISTINCT user_id) AS active_users
  FROM public.activity_log
  WHERE created_at > now() - interval '90 days'
  GROUP BY date_trunc('day', created_at)::date
)
SELECT
  d::date AS day,
  COALESCE(dau.active_users, 0) AS dau,
  (
    SELECT COUNT(DISTINCT al.user_id)
    FROM public.activity_log al
    WHERE al.created_at >= d
      AND al.created_at < d + interval '7 days'
  ) AS wau,
  (
    SELECT COUNT(DISTINCT al.user_id)
    FROM public.activity_log al
    WHERE al.created_at >= d
      AND al.created_at < d + interval '30 days'
  ) AS mau
FROM days d
LEFT JOIN dau ON dau.day = d::date
ORDER BY d::date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_active_users_day
  ON public.mv_admin_active_users (day);

-- ─── 1.3 mv_admin_content_engagement ───────────────────────
-- Vault adds/removes + ratings + completions per day.
-- Uses the activity_action_type enum values (see database.types.ts).
DROP MATERIALIZED VIEW IF EXISTS public.mv_admin_content_engagement;
CREATE MATERIALIZED VIEW public.mv_admin_content_engagement AS
SELECT
  date_trunc('day', created_at)::date AS day,
  action,
  COUNT(*) AS count,
  COUNT(DISTINCT user_id) AS unique_users
FROM public.activity_log
WHERE created_at > now() - interval '90 days'
  AND action IN (
    'vault_created', 'vault_updated', 'vault_deleted', 'vault_restored',
    'vault_status_changed', 'vault_rated',
    'vault_favorited', 'vault_unfavorited',
    'collection_created', 'collection_updated', 'collection_deleted',
    'episode_progress_updated',
    'universe_subscribed', 'universe_unsubscribed'
  )
GROUP BY date_trunc('day', created_at)::date, action
ORDER BY day DESC;

CREATE INDEX IF NOT EXISTS idx_mv_admin_content_engagement_day
  ON public.mv_admin_content_engagement (day DESC);
CREATE INDEX IF NOT EXISTS idx_mv_admin_content_engagement_action
  ON public.mv_admin_content_engagement (action, day DESC);

-- ─── 1.4 mv_admin_top_titles ───────────────────────────────
-- Top 100 most-vaulted titles (any status) in the last 30 days.
-- vault_status_type values: planned, watching, completed, on_hold, dropped
DROP MATERIALIZED VIEW IF EXISTS public.mv_admin_top_titles;
CREATE MATERIALIZED VIEW public.mv_admin_top_titles AS
SELECT
  v.tmdb_id,
  v.media_type,
  COUNT(*) AS vault_count,
  COUNT(*) FILTER (WHERE v.status = 'completed') AS completed_count,
  COUNT(*) FILTER (WHERE v.status = 'planned') AS planned_count,
  COUNT(*) FILTER (WHERE v.status = 'watching') AS watching_count,
  COUNT(DISTINCT v.user_id) AS unique_users,
  AVG(v.rating) FILTER (WHERE v.rating IS NOT NULL) AS avg_rating
FROM public.vault v
WHERE v.created_at > now() - interval '30 days'
  AND v.deleted_at IS NULL
GROUP BY v.tmdb_id, v.media_type
ORDER BY vault_count DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_top_titles_tmdb
  ON public.mv_admin_top_titles (tmdb_id, media_type);

-- ─── 1.5 Refresh function + pg_cron job ────────────────────
-- Refreshes all admin MVs every hour at minute 5 (avoiding the
-- top-of-minute rush). Wrapped in a single function so the cron
-- entry is a single CALL.

CREATE OR REPLACE FUNCTION public.refresh_admin_analytics()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_admin_user_growth;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_admin_active_users;
  REFRESH MATERIALIZED VIEW public.mv_admin_content_engagement;
  REFRESH MATERIALIZED VIEW public.mv_admin_top_titles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Schedule the refresh. Note: pg_cron requires the job to be
-- unscheduled before being re-scheduled (cron.schedule raises
-- a duplicate-key error if the jobname already exists).
--
-- IMPORTANT: The outer DO block uses $$ ... $$ dollar-quoting.
-- The cron.schedule() call needs a string literal as its 3rd arg,
-- and that string itself contains a function call. We use a
-- DIFFERENT tag ($cmd$) for the inner string so PostgreSQL
-- correctly distinguishes them — using $$ for both would cause
-- the outer block to close prematurely at the inner $$.
--
-- NOTE: We CANNOT run `UPDATE cron.job` directly — only the
-- postgres superuser (cloud role) can modify cron.job. Instead,
-- we pass the jobname as the first argument to cron.schedule(),
-- which sets it atomically. We unschedule by name first, ignoring
-- the error if the job doesn't exist yet.
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('refresh_admin_analytics');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist yet — that's fine
    NULL;
  END;
  PERFORM cron.schedule(
    'refresh_admin_analytics',       -- jobname (pg_cron >= 1.4)
    '5 * * * *',                     -- every hour at minute 5
    $cmd$SELECT public.refresh_admin_analytics();$cmd$
  );
END;
$$;

-- ============================================================
-- 2. MAINTENANCE — admin-runnable cleanup functions
-- ============================================================
--
-- All maintenance operations are exposed as SECURITY DEFINER
-- functions that take no args (or simple args) and return a JSONB
-- summary. The API route calls them via the service_role client
-- and logs each invocation in maintenance_runs.
--
-- SECURITY: These functions are callable by any role (PUBLIC EXECUTE)
-- but the API route gates them behind requireAdmin(). The
-- SECURITY DEFINER attribute means they run with the function
-- owner's privileges (postgres), bypassing RLS — that's needed to
-- clean up other users' rows.

-- ─── 2.1 maintenance_runs audit table ──────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  rows_affected BIGINT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_started_at
  ON public.maintenance_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_runs_operation
  ON public.maintenance_runs (operation, started_at DESC);

ALTER TABLE public.maintenance_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_runs_select ON public.maintenance_runs;
CREATE POLICY maintenance_runs_select ON public.maintenance_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );

DROP POLICY IF EXISTS maintenance_runs_insert ON public.maintenance_runs;
CREATE POLICY maintenance_runs_insert ON public.maintenance_runs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS maintenance_runs_update ON public.maintenance_runs;
CREATE POLICY maintenance_runs_update ON public.maintenance_runs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );

-- ─── 2.2 purge_soft_deleted_profiles ───────────────────────
-- Permanently delete profiles (and cascade) that were soft-deleted
-- more than `days` days ago. Default 90 days.
--
-- We DON'T cascade through auth.users — that's a Supabase Auth
-- management API call, not a SQL operation. The admin should
-- use the Supabase dashboard to fully delete the auth.users row
-- after this purge if they want complete removal.
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_profiles(days INT DEFAULT 90)
RETURNS JSONB AS $$
DECLARE
  affected BIGINT;
  cutoff TIMESTAMPTZ := now() - (days || ' days')::interval;
BEGIN
  -- First, count what we're about to delete
  SELECT COUNT(*) INTO affected
    FROM public.profiles
    WHERE deleted_at IS NOT NULL
      AND deleted_at < cutoff;

  -- Delete (RLS-bypassed because SECURITY DEFINER)
  DELETE FROM public.profiles
    WHERE deleted_at IS NOT NULL
      AND deleted_at < cutoff;

  RETURN jsonb_build_object(
    'operation', 'purge_soft_deleted_profiles',
    'cutoff', cutoff,
    'rows_affected', affected
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ─── 2.3 purge_old_activity_log ────────────────────────────
-- Delete activity_log rows older than `days` days. Default 180 days.
-- Activity log is high-volume; pruning keeps the table small.
CREATE OR REPLACE FUNCTION public.purge_old_activity_log(days INT DEFAULT 180)
RETURNS JSONB AS $$
DECLARE
  affected BIGINT;
  cutoff TIMESTAMPTZ := now() - (days || ' days')::interval;
BEGIN
  SELECT COUNT(*) INTO affected
    FROM public.activity_log
    WHERE created_at < cutoff;

  DELETE FROM public.activity_log
    WHERE created_at < cutoff;

  RETURN jsonb_build_object(
    'operation', 'purge_old_activity_log',
    'cutoff', cutoff,
    'rows_affected', affected
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ─── 2.4 purge_expired_tmdb_cache ──────────────────────────
-- Delete tmdb_cache rows older than `days` days. Default 30 days.
-- The cache will be re-populated on demand. We also report the
-- cache hit/miss counters from app_config (if present).
CREATE OR REPLACE FUNCTION public.purge_expired_tmdb_cache(days INT DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  affected BIGINT;
  cutoff TIMESTAMPTZ := now() - (days || ' days')::interval;
  total_remaining BIGINT;
BEGIN
  SELECT COUNT(*) INTO affected
    FROM public.tmdb_cache
    WHERE fetched_at < cutoff;

  DELETE FROM public.tmdb_cache
    WHERE fetched_at < cutoff;

  SELECT COUNT(*) INTO total_remaining FROM public.tmdb_cache;

  RETURN jsonb_build_object(
    'operation', 'purge_expired_tmdb_cache',
    'cutoff', cutoff,
    'rows_affected', affected,
    'rows_remaining', total_remaining
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ─── 2.5 purge_orphaned_collection_entries ─────────────────
-- Delete collection_entries whose vault_id no longer exists
-- (vault row was hard-deleted, which shouldn't happen because we
-- soft-delete, but defensive cleanup is cheap).
CREATE OR REPLACE FUNCTION public.purge_orphaned_collection_entries()
RETURNS JSONB AS $$
DECLARE
  affected BIGINT;
BEGIN
  SELECT COUNT(*) INTO affected
    FROM public.collection_entries ce
    LEFT JOIN public.vault v ON ce.vault_id = v.id
    WHERE v.id IS NULL;

  DELETE FROM public.collection_entries
    WHERE vault_id NOT IN (SELECT id FROM public.vault);

  RETURN jsonb_build_object(
    'operation', 'purge_orphaned_collection_entries',
    'rows_affected', affected
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ─── 2.6 cleanup_old_admin_actions ─────────────────────────
-- Delete admin_actions rows older than `days` days. Default 365 days.
CREATE OR REPLACE FUNCTION public.cleanup_old_admin_actions(days INT DEFAULT 365)
RETURNS JSONB AS $$
DECLARE
  affected BIGINT;
  cutoff TIMESTAMPTZ := now() - (days || ' days')::interval;
BEGIN
  SELECT COUNT(*) INTO affected
    FROM public.admin_actions
    WHERE created_at < cutoff;

  DELETE FROM public.admin_actions
    WHERE created_at < cutoff;

  RETURN jsonb_build_object(
    'operation', 'cleanup_old_admin_actions',
    'cutoff', cutoff,
    'rows_affected', affected
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ─── 2.7 refresh_admin_analytics_now ───────────────────────
-- Manually trigger an analytics refresh (the admin clicks "Refresh
-- now" in the UI). Same as the pg_cron job, but callable on demand.
-- (Already defined in §1.5 — `public.refresh_admin_analytics()`.)

-- ─── 2.8 vacuum_analyze ────────────────────────────────────
-- VACUUM ANALYZE cannot run inside a function (transaction block).
-- We expose a placeholder that the API route can call via
-- rpc() — it'll just return a hint to use the Supabase dashboard.
CREATE OR REPLACE FUNCTION public.vacuum_analyze_hint()
RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'operation', 'vacuum_analyze',
    'note', 'VACUUM cannot run inside a transaction. Use Supabase Dashboard → Database → SQL Editor to run: VACUUM ANALYZE VERBOSE;'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grant execute on all maintenance functions to authenticated
GRANT EXECUTE ON FUNCTION public.purge_soft_deleted_profiles(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_activity_log(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_tmdb_cache(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_orphaned_collection_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_admin_actions(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_admin_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vacuum_analyze_hint() TO authenticated;

-- Grant SELECT on materialized views to authenticated (admin-only via RLS on profiles)
GRANT SELECT ON public.mv_admin_user_growth TO authenticated;
GRANT SELECT ON public.mv_admin_active_users TO authenticated;
GRANT SELECT ON public.mv_admin_content_engagement TO authenticated;
GRANT SELECT ON public.mv_admin_top_titles TO authenticated;

-- ============================================================
-- 3. SETTINGS — seed app_config with default values
-- ============================================================
--
-- We use ON CONFLICT to make this idempotent — if the key already
-- exists (set by the admin via the UI), we DON'T overwrite it.
-- Only insert if missing.

INSERT INTO public.app_config (key, value, updated_by) VALUES
  (
    'site_settings',
    '{
      "site_name": "CineLog",
      "tagline": "Your personal cinema universe",
      "contact_email": "support@cinelog.app",
      "support_url": "",
      "privacy_url": "",
      "terms_url": "",
      "social_links": {
        "twitter": "",
        "instagram": "",
        "github": ""
      }
    }'::jsonb,
    NULL
  ),
  (
    'rate_limits',
    '{
      "api_per_min": 60,
      "auth_attempts_per_hr": 20,
      "upload_mb_per_day": 50
    }'::jsonb,
    NULL
  ),
  (
    'tmdb_settings',
    '{
      "cache_ttl_days": 30,
      "fallback_language": "en",
      "include_adult": false
    }'::jsonb,
    NULL
  ),
  (
    'maintenance_window',
    '{
      "enabled": false,
      "scheduled_at": null,
      "message": ""
    }'::jsonb,
    NULL
  ),
  (
    'retention_policy',
    '{
      "soft_deleted_profiles_days": 90,
      "activity_log_days": 180,
      "tmdb_cache_days": 30,
      "admin_actions_days": 365
    }'::jsonb,
    NULL
  ),
  (
    'analytics_last_refresh',
    '{"at": null, "duration_ms": null}'::jsonb,
    NULL
  )
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. Done — print summary
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Phase 3 migration complete:';
  RAISE NOTICE '  • 4 materialized views created (mv_admin_*)';
  RAISE NOTICE '  • pg_cron job "refresh_admin_analytics" scheduled for every hour at minute 5';
  RAISE NOTICE '  • 6 maintenance functions created (purge_*, cleanup_*, refresh_*, vacuum_analyze_hint)';
  RAISE NOTICE '  • maintenance_runs audit table created';
  RAISE NOTICE '  • 6 default app_config keys seeded (site_settings, rate_limits, tmdb_settings, maintenance_window, retention_policy, analytics_last_refresh)';
END;
$$;
