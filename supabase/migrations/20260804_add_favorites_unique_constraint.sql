-- ============================================================
-- CineLog V2 — Phase 4 Task 3: Favorites UNIQUE constraint
-- Date: 2026-08-04
--
-- Issue:
--   The Favorites collection is meant to be unique per user, but the
--   application enforced this only via a module-level mutex
--   (`ensureFavoritesInFlight`) and a runtime duplicate-cleanup
--   pass in `ensureFavoritesExistsInSupabase`. Two concurrent tabs
--   (or a tab + a service-worker refresh) could both pass the
--   "hasFavorites" check before either INSERT committed, producing
--   duplicate "Favorites" rows. The cleanup pass self-healed the
--   duplicates on the next sign-in, but between the race and the
--   heal, the UI showed two Favorites folders and writes could land
--   in either copy.
--
-- Fix:
--   Add a partial UNIQUE constraint on `(user_id, name)` that only
--   fires when `name = 'Favorites'` AND the row is not soft-deleted.
--   This is the cheapest way to enforce uniqueness at the DB level
--   without preventing users from creating other collections that
--   happen to share a name (Bible §04: "Duplicate names allowed").
--
--   The `WHERE name = 'Favorites'` predicate keeps the constraint
--   cheap (the unique index only covers Favorites rows) and scoped
--   (it doesn't affect other collections).
--
--   The `WHERE deleted_at IS NULL` predicate ensures soft-deleted
--   Favorites rows don't block re-creation — if a user deletes their
--   Favorites folder and later re-creates it, the old soft-deleted
--   row won't trigger a unique violation on the new INSERT.
--
-- Conflict handling:
--   The application's `ensureFavoritesExistsInSupabase` uses
--   `getCollections` + `createCollectionInSupabase`, neither of
--   which uses ON CONFLICT. If the race still occurs (two tabs
--   INSERT simultaneously), the second INSERT will now raise a
--   unique_violation (23505) instead of silently succeeding. The
--   hook catches the error and the duplicate-cleanup pass still
--   runs on the next sign-in. The net effect: the race window is
--   closed at the DB level; the app-level cleanup is now a
--   belt-and-suspenders backstop instead of the only defence.
--
-- Compatibility:
--   • Additive — no existing columns are changed.
--   • If duplicate Favorites rows already exist (from the previous
--     bug), this migration's CREATE CONSTRAINT will FAIL because the
--     unique index can't be built over duplicate rows. The
--     application's self-heal pass should have already cleaned them
--     up, but to be safe we run a deduplication DELETE before
--     creating the constraint. We keep the oldest Favorites row per
--     user (lowest created_at) and soft-delete the rest.
-- ============================================================

-- ─── 1. Deduplicate existing Favorites rows (safety net) ──────
--
-- If the previous race condition left any user with multiple
-- "Favorites" rows, soft-delete all but the oldest before creating
-- the unique constraint. This is idempotent — if there are no
-- duplicates, the UPDATE affects 0 rows.
--
-- We soft-delete (set deleted_at) rather than hard-delete so the
-- action is reversible if a user reports data loss. The
-- purge_soft_deleted_vault cron (Task 10) doesn't touch the
-- collections table, so these rows linger until manually purged.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM collections
   WHERE name = 'Favorites'
     AND deleted_at IS NULL
)
UPDATE collections
   SET deleted_at = now()
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── 2. Create the partial unique constraint ──────────────────
--
-- We use a partial unique INDEX (not a CONSTRAINT) because Postgres
-- only supports partial indexes, not partial constraints. The
-- effect is identical — the index enforces uniqueness on the
-- covered rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_collections_favorites_per_user
  ON collections(user_id)
  WHERE name = 'Favorites'
    AND deleted_at IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 3 migration complete:';
  RAISE NOTICE '  • Existing duplicate Favorites rows soft-deleted (if any)';
  RAISE NOTICE '  • Partial unique index uq_collections_favorites_per_user created';
  RAISE NOTICE '  • Enforces (user_id, name=''Favorites'') uniqueness at DB level';
  RAISE NOTICE '  • Soft-deleted rows excluded so delete+recreate works';
END;
$$;
