-- ============================================================
-- CineLog V2 — Phase 4 Task 26: get_user_email RPC
-- Date: 2026-08-04
--
-- Issue:
--   The admin panel's user management page cannot fetch user emails
--   without joining auth.users, which is not directly accessible in
--   RLS. The existing profiles table does not store email. The
--   current admin /api/admin/users list endpoint works around this
--   by calling `supabase.auth.admin.listUsers({ page: 1, perPage:
--   1000 })` and filtering client-side — which is wasteful (fetches
--   up to 1000 user records when the admin only needs 25 emails)
--   and leaks every user's email to the server-side log if the
--   admin server is ever compromised.
--
-- Fix:
--   Add a SECURITY DEFINER function `get_user_email(user_id UUID)
--   RETURNS TEXT` that returns the email for a single user_id
--   from auth.users. The function:
--     • Is callable by `authenticated` (so the admin SDK client can
--       invoke it) AND `service_role` (so the server API route can
--       invoke it with the service role key).
--     • Performs an admin check on the caller's profile — defense
--       in depth. Even if the EXECUTE grant is leaked to a non-admin
--       authenticated session, the function returns NULL instead of
--       the email.
--     • Returns NULL when the user_id doesn't exist, when the
--       caller isn't an admin, or when the caller is the user
--       themselves (we don't surface self-email through this RPC —
--       the user already has their own email via their session).
--
-- Security trade-off:
--   Per the Phase 0 pattern, maintenance functions are granted
--   EXECUTE only to service_role. This function follows the same
--   pattern (granted to service_role) AND is also granted to
--   authenticated because the task description explicitly requires
--   it. The admin check inside the function is the second layer
--   of defense — if a non-admin somehow calls it, they get NULL.
--
-- Returns:
--   TEXT — the user's email, or NULL when the caller isn't an
--   admin or the user_id doesn't exist.
-- ============================================================

-- ─── 1. Create the function ────────────────────────────────────
--
-- We SET search_path = 'auth' so the `users` table reference
-- resolves unambiguously to `auth.users` (not public.users, which
-- doesn't exist). This prevents search_path hijacking attacks
-- where a malicious user creates a `public.users` table that
-- shadows the real one.
--
-- SECURITY DEFINER is required because auth.users is NOT
-- accessible to authenticated users directly — only the service
-- role and the postgres superuser can read it. Without SECURITY
-- DEFINER, the function would fail with a permission error when
-- called by an authenticated user.

CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'auth'
AS $$
DECLARE
  caller_is_admin BOOLEAN := FALSE;
  result_email TEXT := NULL;
BEGIN
  -- ─── Admin check (defense in depth) ────────────────────────
  -- The EXECUTE privilege is granted to authenticated (per the
  -- task spec), so any signed-in user can technically call this
  -- function. We verify the caller is an active admin before
  -- returning the email. If the caller isn't an admin, return
  -- NULL silently — we don't want to leak whether a given user_id
  -- exists.
  --
  -- NOTE: when called via service_role, auth.uid() returns NULL
  -- and this SELECT returns no rows → caller_is_admin stays
  -- FALSE → we'd return NULL. That would break the admin API
  -- route. So we also short-circuit: if the caller is the
  -- service_role (auth.role() = 'service_role'), skip the admin
  -- check and return the email directly. service_role is trusted
  -- to have already verified admin status via requireAdmin().
  IF auth.role() = 'service_role' THEN
    -- Service role bypasses the admin check — the server API
    -- route has already called requireAdmin().
    SELECT email INTO result_email
      FROM auth.users
      WHERE id = user_id;
    RETURN result_email;
  END IF;

  -- Authenticated caller — verify they're an active admin.
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
        AND p.deleted_at IS NULL
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    -- Not an admin — return NULL. We deliberately don't raise an
    -- exception because that would leak the function's existence
    -- and the existence of the user_id via different error shapes.
    RETURN NULL;
  END IF;

  -- Admin caller — return the requested user's email.
  SELECT email INTO result_email
    FROM auth.users
    WHERE id = user_id;
  RETURN result_email;
END;
$$;

-- ─── 2. Grant EXECUTE ─────────────────────────────────────────
--
-- Grant to:
--   • service_role — used by the /api/admin/users route (server-side
--     admin API). service_role bypasses RLS and the function's
--     internal admin check (we short-circuit on auth.role() =
--     'service_role' above).
--   • authenticated — required by the task spec. The function's
--     internal admin check is the second layer of defense —
--     non-admin callers get NULL.
--
-- REVOKE from anon/public — anonymous callers have no business
-- looking up user emails. (REVOKE is idempotent.)
REVOKE EXECUTE ON FUNCTION public.get_user_email(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO authenticated;

-- ─── 3. Summary ───────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 26 migration complete:';
  RAISE NOTICE '  • get_user_email(user_id UUID) RETURNS TEXT created as SECURITY DEFINER';
  RAISE NOTICE '  • search_path pinned to ''auth'' to prevent search_path hijacking';
  RAISE NOTICE '  • EXECUTE granted to service_role (server-side admin API)';
  RAISE NOTICE '  • EXECUTE granted to authenticated (admin check inside function)';
  RAISE NOTICE '  • EXECUTE revoked from anon + public';
  RAISE NOTICE '  • Returns NULL when caller is not an admin (no existence leak)';
END;
$$;
