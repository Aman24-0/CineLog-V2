-- ============================================================
-- CineLog V2 — Phase 4 Task 10: pg_cron job for trash purge
-- Date: 2026-08-04
--
-- Issue:
--   The `purge_soft_deleted_vault(INT)` RPC was created in
--   migration 20260804_add_purge_soft_deleted_vault.sql but was
--   only callable manually (via the admin Maintenance panel or the
--   /api/admin/maintenance route). Soft-deleted vault items lingered
--   indefinitely if:
--     • The user never visited the Trash page.
--     • No admin triggered the purge manually.
--
--   The trash page's "auto-purge on visit" behaviour is a
--   client-side trigger — it only fires when the user opens the
--   page. Server-side automation is required to guarantee timely
--   purges regardless of user activity.
--
-- Fix:
--   Wire the existing `purge_soft_deleted_vault(30)` RPC to a
--   pg_cron job that runs daily at 02:00 UTC. The job calls the
--   function with `days = 30`, which permanently deletes vault
--   rows soft-deleted more than 30 days ago (and cascades to
--   episode_progress + collection_entries).
--
--   02:00 UTC was chosen because:
--     • It's outside peak hours for the app's primary (US/EU)
--       audience.
--     • It's a fixed, predictable time that admins can grep for
--       in logs.
--     • Daily cadence matches the audit's recommendation.
--
-- Prerequisites:
--   • The `pg_cron` extension must be installed in the Supabase
--     project. Supabase enables it by default on new projects;
--     older projects may need to enable it via the dashboard or
--     `CREATE EXTENSION IF NOT EXISTS pg_cron;` (run separately,
--     as it requires superuser privileges that migrations don't
--     always have).
--   • The `purge_soft_deleted_vault(INT)` function must exist
--     (created by migration 20260804_add_purge_soft_deleted_vault.sql,
--     which runs before this migration).
--
-- Notes:
--   • pg_cron jobs run in the `postgres` database by default and
--     execute as the role that created them (the migration runner,
--     typically `postgres`). The `purge_soft_deleted_vault` function
--     is SECURITY DEFINER owned by `postgres`, so the job can call
--     it even though the job's own role doesn't have direct DELETE
--     privileges on the vault table.
--   • The job name is `cinelog_purge_soft_deleted_vault` so it can
--     be grep'd in `cron.job` and unscheduled via
--     `cron.unschedule('cinelog_purge_soft_deleted_vault')`.
--   • The function is idempotent — running it when there's nothing
--     to purge is a no-op (returns rows_affected: 0).
-- ============================================================

-- ─── 1. Ensure pg_cron is available ────────────────────────────
--
-- CREATE EXTENSION requires superuser. Supabase migrations run as
-- the migration role, which has superuser on most projects. If
-- the extension is already installed, this is a no-op. If the
-- migration role lacks superuser, this statement will fail — the
-- admin should enable pg_cron via the dashboard before running
-- this migration. The error message is descriptive.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ─── 2. Schedule the daily purge ──────────────────────────────
--
-- cron.schedule(name, schedule, command):
--   • name: 'cinelog_purge_soft_deleted_vault'
--   • schedule: '0 2 * * *'  →  every day at 02:00 UTC
--   • command: SELECT public.purge_soft_deleted_vault(30);
--
-- We wrap the schedule call in a DO block so it's idempotent —
-- if the job already exists (e.g. this migration was re-run),
-- we unschedule it first, then re-schedule. This ensures the
-- schedule matches the migration even if the job was manually
-- edited.
DO $$
BEGIN
  -- Unschedule any existing job with this name (no-op if none).
  -- We catch the exception because cron.unschedule raises if the
  -- job doesn't exist.
  BEGIN
    PERFORM cron.unschedule('cinelog_purge_soft_deleted_vault');
  EXCEPTION
    WHEN undefined_object THEN
      NULL; -- job doesn't exist yet — fine
  END;

  -- Schedule the job. The command runs in the `postgres` database
  -- (pg_cron's default). The function call is fully qualified
  -- (public.purge_soft_deleted_vault) so the search_path doesn't
  -- matter.
  PERFORM cron.schedule(
    'cinelog_purge_soft_deleted_vault',
    '0 2 * * *',
    $$SELECT public.purge_soft_deleted_vault(30);$$
  );

  RAISE NOTICE 'Phase 4 Task 10 migration complete:';
  RAISE NOTICE '  • pg_cron extension ensured';
  RAISE NOTICE '  • Job ''cinelog_purge_soft_deleted_vault'' scheduled';
  RAISE NOTICE '  • Runs daily at 02:00 UTC, calls purge_soft_deleted_vault(30)';
  RAISE NOTICE '  • Permanently deletes vault items soft-deleted >30 days ago';
END;
$$;
