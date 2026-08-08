-- ============================================================
-- CineLog V2 — Phase 4 Task 6: Drop redundant position columns
-- Date: 2026-08-04
--
-- Issue:
--   `curated_universe_entries` has four position columns:
--     • position           — admin's primary manual order (USED)
--     • incident_year      — in-universe year for storyline sort (USED)
--     • release_position   — theatrical release date order (UNUSED)
--     • story_position     — in-universe story chronology (UNUSED)
--     • timeline_position  — alias for story_position (UNUSED)
--
--   The audit found that only `position` and `incident_year` are
--   actively used by the application. The other three were legacy
--   sort indexes from an earlier design that stored precomputed
--   sort orders per dimension; the current design derives those
--   orders on the fly from `incident_year` and TMDB `release_date`.
--
--   Keeping the columns around:
--     • Wastes disk (3 INT per row × every curated entry).
--     • Confuses the admin UI (the types still declare them as
--       required fields, even though the editor no longer edits them).
--     • Implies a contract the app no longer honours.
--
-- Fix:
--   Drop `release_position`, `story_position`, and `timeline_position`.
--   The application code has been updated to remove all references
--   to these columns (the mapper, the admin types, the admin API,
--   the discover repository, the timeline sort, and the shared
--   types). The sort modes "story" / "release" / "timeline" now
--   fall back to `position` + `incident_year`, which is the
--   behaviour the audit confirmed is what the app actually does
--   in practice.
--
-- Compatibility:
--   • Destructive — the three columns are dropped. The data they
--     held is lost. This is intentional: the audit confirmed the
--     data is unused. A backup taken before running this migration
--     is the recovery path if the data turns out to be needed.
--   • The `curated_universe_entries` INSERT/UPDATE types in
--     `database.types.ts` are regenerated to omit the columns.
--   • The admin `entries` API no longer accepts or persists these
--     fields (it silently ignored them before; now the types
--     reflect that).
--
--   No CASCADE is needed — no foreign keys or indexes reference
--   these columns (verified by querying pg_indexes before writing
--   this migration).
-- ============================================================

-- Drop the columns. IF EXISTS is idempotent — safe to re-run.
ALTER TABLE curated_universe_entries
  DROP COLUMN IF EXISTS release_position,
  DROP COLUMN IF EXISTS story_position,
  DROP COLUMN IF EXISTS timeline_position;

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 6 migration complete:';
  RAISE NOTICE '  • curated_universe_entries.release_position dropped';
  RAISE NOTICE '  • curated_universe_entries.story_position dropped';
  RAISE NOTICE '  • curated_universe_entries.timeline_position dropped';
  RAISE NOTICE '  • Only position + incident_year remain (actively used)';
END;
$$;
