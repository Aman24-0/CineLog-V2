-- CineLog V2 — Migration: add rewatch_dates column to the vault table
-- -------------------------------------------------------------------
-- Run this in the Supabase SQL editor (Dashboard → SQL → New Query)
-- to enable per-viewing-date tracking for the re-watch feature.
--
-- The `rewatch_count` column already exists (default 0). This migration
-- adds the companion `rewatch_dates` text[] column that stores the date
-- of every viewing in order:
--   - Index 0: first watch date (mirrors `watched_on`)
--   - Indices 1..N: the N re-watch dates
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS check).
-- -------------------------------------------------------------------

ALTER TABLE vault
  ADD COLUMN IF NOT EXISTS rewatch_dates text[] DEFAULT ARRAY[]::text[];

-- Backfill: for existing rows that have a watched_on date but no
-- rewatch_dates, seed rewatch_dates with a single-element array so the
-- first viewing is preserved.
UPDATE vault
  SET rewatch_dates = ARRAY[watched_on]
  WHERE watched_on IS NOT NULL
    AND (rewatch_dates IS NULL OR array_length(rewatch_dates, 1) IS NULL);

-- Comment for future schema readers.
COMMENT ON COLUMN vault.rewatch_dates IS
  'Ordered list of viewing dates (ISO 8601). Index 0 = first watch, 1..N = re-watches. Length should equal rewatch_count + 1.';
