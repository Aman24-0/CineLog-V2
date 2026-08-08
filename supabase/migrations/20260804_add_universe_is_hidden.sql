-- ============================================================
-- CineLog V2 — Phase 4 Task 2: Hidden Universes column
-- Date: 2026-08-04
--
-- Issue:
--   The `user_universe_subscriptions` table had no `is_hidden`
--   column. The Firestore model supported hiding a universe without
--   removing the subscription, but the Supabase migration
--   approximated "hidden" by deleting the subscription (same as
--   "removed"). This meant:
--     • The `hiddenUniverses` memo always returned an empty list.
--     • The "Restore hidden universe" UI never had anything to show.
--     • Users who hid a universe could only re-add it from the
--       "Suggested" list, which was confusing.
--
-- Fix:
--   Add an `is_hidden BOOLEAN DEFAULT FALSE` column to
--   `user_universe_subscriptions`. The application reads this column
--   in `fetchUniversePreferencesFromSupabase()` and the
--   `hiddenUniverses` memo now returns universes the user has
--   subscribed to AND marked hidden.
--
--   Hiding a universe now UPDATEs the row (is_hidden = TRUE) instead
--   of DELETEing it. Restoring UPDATEs it back to FALSE.
--
-- Compatibility:
--   • Additive — existing rows backfill to is_hidden = FALSE, which
--     matches the previous behaviour (every subscription was
--     "visible" because hidden was approximated by deletion).
--   • RLS unchanged — the existing user_universe_subscriptions
--     policies already govern writes; the new column inherits.
-- ============================================================

ALTER TABLE user_universe_subscriptions
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for the "show me my hidden universes" query — partial so it
-- only covers the (rare) hidden rows, not every subscription.
CREATE INDEX IF NOT EXISTS idx_user_universe_subs_hidden
  ON user_universe_subscriptions(user_id)
  WHERE is_hidden = TRUE;

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 2 migration complete:';
  RAISE NOTICE '  • user_universe_subscriptions.is_hidden BOOLEAN DEFAULT FALSE added';
  RAISE NOTICE '  • Partial index idx_user_universe_subs_hidden created';
  RAISE NOTICE '  • hiddenUniverses memo will now return real data';
END;
$$;
