-- ============================================================
-- CineLog V2 — Series per-season watch dates migration (v2.3)
-- ============================================================
--
-- Adds three columns to the `vault` table for series per-season
-- watch date tracking:
--
--   1. season_dates (JSONB)
--      Map of season number (string) → { start, end } for the
--      ORIGINAL watch of each season. Example:
--        { "1": { "start": "2024-01-15", "end": "2024-02-20" },
--          "2": { "start": "2024-03-10", "end": "2024-04-15" } }
--
--   2. season_rewatch_count (integer, default 0)
--      Number of additional times the user has re-watched the
--      entire series (each rewatch = a full pass through all seasons).
--
--   3. season_rewatch_dates (JSONB)
--      Array of per-re-watch per-season maps. Array index = rewatch
--      number (0 = 1st rewatch). Each entry has the same shape as
--      season_dates. Example:
--        [ { "1": { "start": "...", "end": "..." },
--            "2": { "start": "...", "end": "..." } },
--          { "1": { "start": "...", "end": "..." } } ]
--
-- All three columns are nullable / default to empty so existing rows
-- work without backfill. Movies don't use these columns (they use the
-- existing flat rewatch_count + rewatch_dates).
--
-- Run this in the Supabase SQL editor (Dashboard → SQL → New Query).
-- ============================================================

-- 1. season_dates — per-season start/end for the original watch
ALTER TABLE vault
  ADD COLUMN IF NOT EXISTS season_dates JSONB DEFAULT '{}'::jsonb;

-- 2. season_rewatch_count — number of series re-watch passes
ALTER TABLE vault
  ADD COLUMN IF NOT EXISTS season_rewatch_count INTEGER NOT NULL DEFAULT 0;

-- 3. season_rewatch_dates — per-re-watch per-season start/end maps
ALTER TABLE vault
  ADD COLUMN IF NOT EXISTS season_rewatch_dates JSONB DEFAULT '[]'::jsonb;

-- Verify the columns were added
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'vault'
  AND column_name IN ('season_dates', 'season_rewatch_count', 'season_rewatch_dates')
ORDER BY column_name;
