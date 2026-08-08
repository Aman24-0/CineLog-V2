-- ============================================================
-- CineLog V2 — Phase 4 Task 1: Smart Collections rules column
-- Date: 2026-08-04
--
-- Issue:
--   The `collections` table had no column to persist smart-collection
--   rules. The hook `useCollections.updateSmartRules()` threw an
--   `UnsupportedFeatureError` whenever a user tried to save rules for
--   a smart collection, which meant smart collections were effectively
--   read-only decorations — the rules were evaluated live in memory
--   but never survived a page refresh or a device switch.
--
-- Fix:
--   Add a nullable `rules JSONB` column to `collections`. The column
--   is NULL for non-smart collections (user / curated) and holds a
--   JSON-serialised `SmartRule[]` for `collection_type = 'smart'` rows.
--
--   The application's `SmartRule` shape is:
--     {
--       field: "director" | "genre" | "franchise" | "year" |
--              "rating" | "status" | "keyword" | "release_date",
--       operator: "is" | "is_not" | "contains" | "gte" |
--                 "lte" | "between",
--       value: string | number | [number, number]
--     }
--
--   We do NOT add a CHECK constraint on the JSON shape — the
--   application validates the rules before writing, and a DB-level
--   JSON-schema check would couple the schema to the app's rule
--   grammar (which is still evolving). The column is purely a
--   persistence bag; the app is the source of truth for the shape.
--
-- Compatibility:
--   • Additive — no existing columns are changed, no data is lost.
--   • NULL default — existing rows (including curated collections)
--     get NULL, which the mapper treats as "no rules".
--   • RLS unchanged — the existing collections policies already
--     govern writes to the row; the new column inherits those.
-- ============================================================

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT NULL;

-- Index smart collections by type for the "smart collections" list
-- query (the UI fetches all smart collections for a user). The index
-- is partial — it only covers rows where collection_type = 'smart'
-- so it doesn't bloat the index for the (more common) user rows.
CREATE INDEX IF NOT EXISTS idx_collections_smart
  ON collections(user_id)
  WHERE collection_type = 'smart';

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 1 migration complete:';
  RAISE NOTICE '  • collections.rules JSONB column added (nullable)';
  RAISE NOTICE '  • Partial index idx_collections_smart created';
  RAISE NOTICE '  • useCollections.updateSmartRules() can now persist rules';
END;
$$;
