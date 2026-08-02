-- ============================================================
-- CineLog V2 — Phase 0 Security Fixes (Audit Report)
-- Date: 2026-08-01
--
-- Addresses three critical RLS over-permissions flagged in the
-- GLM Codebase Audit Report:
--
--   1. Maintenance SQL functions (purge_* / cleanup_* / refresh_*)
--      were granted EXECUTE to authenticated → any signed-in user
--      could wipe the audit log or hard-delete soft-deleted profiles
--      via supabase.rpc(...).
--
--   2. admin_actions + maintenance_runs INSERT policies only checked
--      auth.uid() IS NOT NULL → any authenticated user could insert
--      fake audit log entries or maintenance run records.
--
--   3. tmdb_cache INSERT/UPDATE policies allowed any authenticated
--      user to poison the shared TMDB metadata cache.
--
-- All writes are now gated either behind service_role (which
-- bypasses RLS and is only used by server API routes) or behind an
-- admin check on profiles.is_admin = TRUE AND admin_disabled_at
-- IS NULL AND deleted_at IS NULL.
--
-- Idempotent: every statement uses DROP POLICY IF EXISTS /
-- REVOKE IF EXISTS semantics. Safe to re-run.
-- ============================================================

-- ─── 1. Revoke EXECUTE on maintenance functions from authenticated/anon/public ──
--
-- SECURITY DEFINER functions execute with the OWNER's privileges
-- (postgres), so the only thing standing between a malicious user
-- and "DELETE FROM profiles" is the EXECUTE privilege. We revoke
-- it from every web-facing role and grant ONLY to service_role,
-- which is exclusively used by server-side API routes that have
-- already verified the caller is an admin (requireAdmin()).
--
-- REVOKE is idempotent — running it twice is a no-op.

REVOKE EXECUTE ON FUNCTION public.purge_soft_deleted_profiles(INT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_old_activity_log(INT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_expired_tmdb_cache(INT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_orphaned_collection_entries() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_admin_actions(INT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.refresh_admin_analytics() FROM authenticated, anon, public;

-- Grant to service_role only. service_role bypasses RLS entirely
-- and its key never reaches the browser bundle (server-only env var).
-- We re-grant even if the original migration already did so the
-- migration is self-contained and idempotent.
GRANT EXECUTE ON FUNCTION public.purge_soft_deleted_profiles(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_activity_log(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_tmdb_cache(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_orphaned_collection_entries() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_admin_actions(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_admin_analytics() TO service_role;

-- ─── 2. Tighten admin_actions + maintenance_runs INSERT policies ────────────────
--
-- Previously: WITH CHECK (auth.uid() IS NOT NULL) → any signed-in
-- user could INSERT fake audit records.
--
-- Now: WITH CHECK (admin check on profiles). Only active admins can
-- insert. The service_role (used by /api/admin/* routes after
-- requireAdmin()) bypasses RLS entirely, so the server-side path
-- is unaffected.
--
-- We also added the deleted_at IS NULL guard so that soft-deleted
-- admin profiles can't insert audit records during the purge window.

DROP POLICY IF EXISTS admin_actions_insert ON public.admin_actions;
CREATE POLICY admin_actions_insert ON public.admin_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = TRUE
        AND profiles.admin_disabled_at IS NULL
        AND profiles.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS maintenance_runs_insert ON public.maintenance_runs;
CREATE POLICY maintenance_runs_insert ON public.maintenance_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = TRUE
        AND profiles.admin_disabled_at IS NULL
        AND profiles.deleted_at IS NULL
    )
  );

-- ─── 3. Restrict tmdb_cache writes to service_role only ─────────────────────────
--
-- Previously: INSERT/UPDATE allowed for any authenticated user →
-- cache poisoning risk (a malicious user could insert fake metadata
-- that would be served to ALL users on the next cache lookup).
--
-- Now: DROP the INSERT/UPDATE policies entirely. The absence of an
-- INSERT/UPDATE policy for `authenticated` means those operations
-- are DENIED at the RLS layer. service_role bypasses RLS so the
-- server-side TMDB cache writer (api/tmdb-cache proxy) still works.
--
-- Public SELECT is preserved — tmdb_cache is shared metadata, not
-- user-specific. We re-create the SELECT policy defensively in case
-- a future migration drops it.

DROP POLICY IF EXISTS tmdb_cache_insert ON public.tmdb_cache;
DROP POLICY IF EXISTS tmdb_cache_update ON public.tmdb_cache;

DROP POLICY IF EXISTS tmdb_cache_select ON public.tmdb_cache;
CREATE POLICY tmdb_cache_select ON public.tmdb_cache
  FOR SELECT USING (true);

-- ─── 4. Summary ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Phase 0 security migration complete:';
  RAISE NOTICE '  • EXECUTE revoked on 6 maintenance functions from authenticated/anon/public';
  RAISE NOTICE '  • EXECUTE granted on 6 maintenance functions to service_role only';
  RAISE NOTICE '  • admin_actions INSERT now requires active admin profile';
  RAISE NOTICE '  • maintenance_runs INSERT now requires active admin profile';
  RAISE NOTICE '  • tmdb_cache INSERT/UPDATE policies dropped (service_role only)';
  RAISE NOTICE '  • tmdb_cache SELECT preserved for public read';
END;
$$;
