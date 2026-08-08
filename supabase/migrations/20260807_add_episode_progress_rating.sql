-- ============================================================
-- CineLog V2 — Phase 6 Task 2: Episode-level rating column
-- Date: 2026-08-07
--
-- Issue:
--   The `episode_progress` table tracked which episodes the user had
--   watched (vault_id, season_number, episode_number, is_completed,
--   watched_at) but had NO column for a per-episode rating. Users
--   could rate a whole title (vault.rating) but couldn't rate
--   individual episodes — a feature spec'd in the Details modal
--   redesign ("EpisodeCard includes a 1-10 / 1-5 rating input").
--
-- Fix:
--   Add a nullable `rating INT` column to `episode_progress`. NULL
--   means "no rating" (the default for existing + new rows). The
--   application validates the rating range before writing — see
--   `episodeProgressAdapter.updateEpisodeRatingInSupabase`.
--
--   We use INT (not NUMERIC) because the application's rating scale
--   is integer (1-10 for 10-star users, 1-5 for 5-star users). The
--   DB has no opinion on which scale the user picked — it just
--   stores whatever integer the app sends.
--
-- Compatibility:
--   • Additive — no existing columns are changed, no data is lost.
--   • NULL default — existing rows (including future rows created
--     by the existing upsertEpisodeProgress path) get NULL, which
--     the app treats as "no rating".
--   • RLS unchanged — the existing episode_progress policies govern
--     writes to the row; the new column inherits those.
--   • No CHECK constraint on the range — the app validates, and a
--     DB-level CHECK would couple the schema to the app's rating
--     scale (which can be 1-5 OR 1-10 depending on user preference).
-- ============================================================

ALTER TABLE episode_progress
  ADD COLUMN IF NOT EXISTS rating INT DEFAULT NULL;

DO $$
BEGIN
  RAISE NOTICE 'Phase 6 Task 2 migration complete:';
  RAISE NOTICE '  • episode_progress.rating INT column added (nullable)';
  RAISE NOTICE '  • NULL = no rating; 1-10 (10-star) or 1-5 (5-star) — app validates';
END;
$$;
