-- ============================================================
-- CineLog V2 — Fix vault unique constraint for upsert support
-- ============================================================
--
-- PROBLEM:
--   The vault table currently has a UNIQUE(user_id, tmdb_id) constraint
--   (without media_type). This causes two issues:
--
--   1. Importing a backup FAILS for items that already exist in the
--      vault with a DIFFERENT media_type (e.g. you had tmdb_id=123 as
--      "movie", but the backup has it as "tv"). The insert violates
--      the unique constraint and is counted as "failed".
--
--   2. The new upsertVaultItem() function uses
--      onConflict: "user_id,tmdb_id,media_type" — this requires a
--      matching unique constraint. Without it, Supabase falls back to
--      a plain insert and the same failures occur.
--
-- SOLUTION:
--   Drop the old UNIQUE(user_id, tmdb_id) constraint and replace it
--   with UNIQUE(user_id, tmdb_id, media_type). This allows the same
--   TMDB id to exist as both a movie and a tv entry (which is valid —
--   TMDB uses separate id namespaces for movies and tv, but occasionally
--   the same numeric id appears in both).
--
--   After this migration, upsertVaultItem() will correctly:
--     - INSERT new items
--     - UPDATE existing items (same tmdb_id + media_type)
--     - INSERT items with same tmdb_id but different media_type (no conflict)
--
-- SAFETY:
--   - This migration is IDEMPOTENT — safe to run multiple times.
--   - It first checks if the old constraint exists before dropping.
--   - It first checks if the new constraint exists before creating.
--   - It will NOT delete any data.
--
-- RUN THIS IN: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Step 1: Find and drop any existing unique constraint on (user_id, tmdb_id)
-- without media_type. The constraint name varies, so we use a DO block
-- to find it dynamically.
DO $$
DECLARE
  old_constraint_name text;
BEGIN
  SELECT conname INTO old_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'vault'::regclass
    AND contype = 'u'  -- unique constraint
    AND array_to_string(conkey, ',') IN (
      -- (user_id, tmdb_id) column orders
      (SELECT array_to_string(ARRAY[
        attnum('vault', 'user_id'),
        attnum('vault', 'tmdb_id')
      ], ',')),
      (SELECT array_to_string(ARRAY[
        attnum('vault', 'tmdb_id'),
        attnum('vault', 'user_id')
      ], ','))
    )
    AND conname != 'vault_user_tmdb_media_uniq';

  IF old_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE vault DROP CONSTRAINT IF EXISTS %I', old_constraint_name);
    RAISE NOTICE 'Dropped old unique constraint: %', old_constraint_name;
  ELSE
    RAISE NOTICE 'No old (user_id, tmdb_id) unique constraint found — nothing to drop.';
  END IF;
END $$;

-- Step 2: Drop any unique INDEX on (user_id, tmdb_id) without media_type
-- (in case the constraint was implemented as an index instead).
DO $$
DECLARE
  old_index_name text;
BEGIN
  SELECT indexname INTO old_index_name
  FROM pg_indexes
  WHERE tablename = 'vault'
    AND indexdef ILIKE '%UNIQUE%'
    AND indexdef ILIKE '%user_id%'
    AND indexdef ILIKE '%tmdb_id%'
    AND indexdef NOT ILIKE '%media_type%'
    AND indexname != 'vault_user_tmdb_media_uniq';

  IF old_index_name IS NOT NULL THEN
    EXECUTE format('DROP INDEX IF EXISTS %I', old_index_name);
    RAISE NOTICE 'Dropped old unique index: %', old_index_name;
  ELSE
    RAISE NOTICE 'No old (user_id, tmdb_id) unique index found — nothing to drop.';
  END IF;
END $$;

-- Step 3: Create the correct unique constraint on (user_id, tmdb_id, media_type)
-- if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vault'::regclass
      AND contype = 'u'
      AND conname = 'vault_user_tmdb_media_uniq'
  ) THEN
    ALTER TABLE vault
      ADD CONSTRAINT vault_user_tmdb_media_uniq UNIQUE (user_id, tmdb_id, media_type);
    RAISE NOTICE 'Created unique constraint: vault_user_tmdb_media_uniq (user_id, tmdb_id, media_type)';
  ELSE
    RAISE NOTICE 'Constraint vault_user_tmdb_media_uniq already exists — skipping.';
  END IF;
END $$;

-- Step 4: Verify the final state
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'vault'::regclass
  AND contype = 'u'
ORDER BY conname;

-- Expected output:
--   constraint_name              | definition
--   -----------------------------+--------------------------------------------------------
--   vault_user_tmdb_media_uniq   | UNIQUE (user_id, tmdb_id, media_type)
