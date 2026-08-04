-- ============================================================
-- CineLog V2 — Phase 4 Task 5: Universe Phases before_entry_kind
-- Date: 2026-08-04
--
-- Issue:
--   `universe_phases.before_entry_id` is TEXT and stores EITHER:
--     • a `curated_universe_entries.id` UUID, OR
--     • a TMDB id (number-as-string)
--
--   The original migration (20260729_add_archived_at_to_collections.sql)
--   chose TEXT so a single column could hold either kind of
--   identifier. But there's no way to tell which kind a given row
--   holds — the consumer has to guess by trying to parse it as a
--   UUID and falling back to a TMDB-id lookup. That's fragile:
--     • A future TMDB id that happens to be 32 hex chars would
--       parse as a UUID and resolve to the wrong entry.
--     • The "Missing entry {id}" fallback in the admin UI can't
--       distinguish "wrong kind" from "entry was deleted".
--
-- Fix:
--   Add a `before_entry_kind VARCHAR(16)` column that explicitly
--   records whether `before_entry_id` is a UUID or a TMDB id.
--   Allowed values: 'uuid' | 'tmdb_id'. NULL is allowed so the
--   column can stay NULL when `before_entry_id` is NULL (the
--   "top of timeline" case).
--
--   The admin UI and the consumer (CollectionDetailPage) use this
--   column to resolve `before_entry_id` safely:
--     • kind = 'uuid'    → look up curated_universe_entries.id
--     • kind = 'tmdb_id' → look up curated_universe_entries.tmdb_id
--
-- Migration of existing rows:
--   The current admin UI stores the TMDB id (because that's what
--   `CollectionEntry.id` exposes — see collectionMapper.ts:83).
--   So every existing non-NULL `before_entry_id` is a TMDB id.
--   We backfill `before_entry_kind = 'tmdb_id'` for all rows where
--   `before_entry_id IS NOT NULL`.
--
--   (If a future admin feature writes UUIDs, it should set
--    `before_entry_kind = 'uuid'` at insert time. The admin UI
--    updated by this task always writes 'tmdb_id'.)
--
-- Compatibility:
--   • Additive — no existing columns are changed, no data is lost.
--   • Backfill is deterministic (every existing value is a TMDB id).
--   • NULL default — new rows can be inserted without the column
--     (though the admin UI now always sets it).
-- ============================================================

ALTER TABLE universe_phases
  ADD COLUMN IF NOT EXISTS before_entry_kind VARCHAR(16);

-- Backfill: every existing non-NULL before_entry_id is a TMDB id
-- (the admin UI has only ever stored TMDB ids).
UPDATE universe_phases
   SET before_entry_kind = 'tmdb_id'
 WHERE before_entry_id IS NOT NULL
   AND before_entry_kind IS NULL;

-- Add a CHECK constraint to lock down the allowed values. This
-- prevents a future bug from writing 'tmdb' or 'TMDB_ID' or ''.
ALTER TABLE universe_phases
  DROP CONSTRAINT IF EXISTS universe_phases_before_entry_kind_check;
ALTER TABLE universe_phases
  ADD CONSTRAINT universe_phases_before_entry_kind_check
  CHECK (before_entry_kind IS NULL
      OR before_entry_kind IN ('uuid', 'tmdb_id'));

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 5 migration complete:';
  RAISE NOTICE '  • universe_phases.before_entry_kind VARCHAR(16) added';
  RAISE NOTICE '  • Existing rows backfilled to ''tmdb_id''';
  RAISE NOTICE '  • CHECK constraint enforces NULL | ''uuid'' | ''tmdb_id''';
END;
$$;
