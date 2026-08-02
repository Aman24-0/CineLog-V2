-- supabase/migrations/20260806_fix_user_preferences_rls.sql
-- ─────────────────────────────────────────────────────────────────
-- CineLog V2 — Fix user_preferences RLS: add INSERT policy
-- ─────────────────────────────────────────────────────────────────
-- BUG: The user_preferences table had SELECT + UPDATE RLS policies
-- but NO INSERT policy. The preferencesSync code uses
-- `.upsert(payload, { onConflict: "user_id" })` which issues an
-- INSERT ... ON CONFLICT DO UPDATE. Without an INSERT policy, the
-- INSERT is rejected with "new row violates row-level security
-- policy for table user_preferences" — even though the UPDATE part
-- would have worked.
--
-- This affected every new user (no existing user_preferences row)
-- and every preference change (the debounced auto-pusher fired
-- constantly, spamming the console with RLS errors).
--
-- Fix: add an INSERT policy that allows authenticated users to
-- insert their own row (auth.uid() = user_id). Combined with the
-- existing UPDATE policy, upsert now works for both new + existing
-- rows.
--
-- Idempotent: DROP IF EXISTS first so re-running is safe.

-- Enable RLS (no-op if already enabled).
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- INSERT policy — a user can only insert a row where they are the
-- user_id. This is the missing piece that made upsert fail.
DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
CREATE POLICY user_preferences_insert_own
  ON public.user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Re-create the existing UPDATE policy for completeness (idempotent).
DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
CREATE POLICY user_preferences_update_own
  ON public.user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Re-create the existing SELECT policy for completeness (idempotent).
DROP POLICY IF EXISTS user_preferences_select_own ON public.user_preferences;
CREATE POLICY user_preferences_select_own
  ON public.user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- Done. Upsert now works: INSERT on first sync, UPDATE on subsequent syncs.
-- ============================================================================
