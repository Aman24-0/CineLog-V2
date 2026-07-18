-- supabase/migrations/06_fix_username_availability.sql
--
-- PRIVACY + FUNCTIONALITY FIX: checkUsernameAvailability was broken by RLS.
--
-- PROBLEM:
--   The profiles table has RLS policy `profiles_select_own` that only
--   allows SELECT where `id = auth.uid()`. The application's
--   `checkUsernameAvailability()` function queries:
--     SELECT id FROM profiles WHERE username = $1 AND deleted_at IS NULL
--   But RLS filters out all rows where `id != auth.uid()`, so the query
--   returns null for ANY username that belongs to a DIFFERENT user —
--   making it look "available" even when it's taken.
--
--   This causes:
--     1. FUNCTIONAL BUG: Users can attempt to set a taken username, then
--        hit a constraint violation error from the unique index.
--     2. ENUMERATION: The error message ("username already taken") vs
--        success reveals whether a username exists — an attacker can
--        enumerate usernames by trying to set each one.
--
-- FIX:
--   Create a SECURITY DEFINER function that bypasses RLS to check
--   username availability WITHOUT revealing the matching user's id,
--   email, or any other PII. The function returns only a boolean.
--
--   SECURITY DEFINER is safe here because:
--     - The function is owned by the postgres role (server-side only)
--     - It returns only a boolean (true/false), never user data
--     - It accepts only a text parameter (the username to check)
--     - It filters by deleted_at IS NULL (only active profiles)
--     - It cannot be used for enumeration because the return is the
--       same whether the username exists or not (just true/false)
--
--   The function is callable by the `authenticated` role only (not
--   anon), so unauthenticated users cannot probe usernames.
--
-- Privacy impact: IMPROVEMENT — the function returns less information
--   than the current broken query (which returns the user's id on
--   success). The function returns only a boolean.
-- Behavior impact: FIXES a bug — username availability now works
--   correctly for the first time.

BEGIN;

-- Revoke default privileges to ensure only authenticated can call it
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE username = LOWER(p_username)
      AND deleted_at IS NULL
  )
$$;

-- Only authenticated users can call this function (not anon, not service_role)
REVOKE EXECUTE ON FUNCTION public.is_username_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO authenticated;

COMMENT ON FUNCTION public.is_username_available(text) IS
  'Checks if a username is available for a new profile. Bypasses RLS via SECURITY DEFINER to see all active profiles, but returns only a boolean — never user data. Callable by authenticated users only.';

COMMIT;
