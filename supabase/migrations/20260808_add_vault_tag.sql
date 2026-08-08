-- Phase 6.2 Task 1a: Add `tag` column to vault table
--
-- The WatchlistItem type already has an optional `tag: string` field, and
-- VaultFilters has a `tag: string` field (default "all"). The vault filter
-- utils already implement filterByAdvanced() with tag matching. But the
-- vault TABLE has no tag column — so the field was never persisted, the
-- uniqueTags memo always returned [], and the Tags filter was removed in
-- the v2 redesign ("feature not currently supported").
--
-- This migration restores the feature at the data layer:
--   - Adds a nullable TEXT column `tag` to vault
--   - RLS: covered by existing vault row policies (user can read/write
--     their own rows, including the new column)

ALTER TABLE vault
  ADD COLUMN IF NOT EXISTS tag TEXT;
