-- ============================================================
-- CineLog V2 — Phase 4 Task 4: Activity Log entity_id → TEXT
-- Date: 2026-08-04
--
-- Issue:
--   `activity_log.entity_id` is declared as UUID but is unused.
--   The application stores entity identifiers in `metadata.tmdb_id`
--   (a JSON field) and always writes `entity_id = NULL` when
--   logging vault activities (see `activityLog.ts:147`). The UUID
--   type is misleading — it implies the column holds a UUID, but
--   it never does.
--
--   A second `admin_actions.entity_id` column exists on the
--   `admin_actions` table and IS actively used (it stores arbitrary
--   string identifiers like "bulk", "homepage_sections",
--   "anime_settings", user UUIDs, etc.). That column is already
--   TEXT. This migration does NOT touch `admin_actions.entity_id`.
--
-- Fix:
--   Change `activity_log.entity_id` from UUID to TEXT. This:
--     • Removes the misleading type hint (the column is unused, but
--       if a future feature wants to populate it, TEXT is the right
--       type — entity ids are NOT always UUIDs, as the admin_actions
--       table proves).
--     • Keeps the column in the schema so the generated
--       `database.types.ts` continues to expose it (existing code
--       that writes `entity_id: null` still type-checks).
--
--   We do NOT drop the column because:
--     1. `activityLog.ts` references it (`entity_id: null` on every
--        insert) — dropping would require a code change to remove
--        those references, which is outside this task's scope.
--     2. The audit trail may want it in the future (e.g. to index
--        by vault UUID for faster filtering).
--
-- Compatibility:
--   • The column is unused (always NULL), so there's no data to
--     migrate — `USING NULL::text` is safe and lossless.
--   • If any row had a non-NULL value (shouldn't happen, but
--     defensive), `USING entity_id::text` would preserve it as a
--     text representation of the UUID. We use the safer
--     `USING NULL::text` because we know the column is always NULL.
--   • The existing index (if any) on entity_id is dropped and
--     recreated as a text index — but there is no such index in the
--     current schema, so this is a no-op.
-- ============================================================

-- Drop any existing index on entity_id before altering the type.
-- (No-op if none exists — DROP INDEX IF EXISTS is idempotent.)
DROP INDEX IF EXISTS idx_activity_log_entity_id;

-- Alter the column type. USING clause specifies how to convert the
-- existing value — we cast to text (which for a UUID produces the
-- canonical hyphenated form). Since the column is always NULL in
-- practice, this is a no-op on data, but the cast is required by
-- Postgres to satisfy the type-change planner.
ALTER TABLE activity_log
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 4 migration complete:';
  RAISE NOTICE '  • activity_log.entity_id type changed UUID → TEXT';
  RAISE NOTICE '  • Column retained (still always NULL — unused but reserved)';
  RAISE NOTICE '  • admin_actions.entity_id untouched (already TEXT, actively used)';
END;
$$;
