-- 20260725_universe_entry_incident_year.sql
--
-- CineLog V2 — Add `incident_year` column to curated_universe_entries.
--
-- Purpose:
--   The admin now sets a single "year of incident" per entry to convey
--   in-universe chronology (e.g. 1943 for Captain America: The First
--   Avenger, 1995 for Captain Marvel). The Storyline sort uses this
--   value directly — earlier years appear first. NULL means unknown;
--   the sort falls back to `story_position` in that case.
--
--   This replaces the previous four-position system (position,
--   release_position, story_position, timeline_position) which was
--   redundant because:
--     - Release sort already uses TMDB release_date (no admin index needed)
--     - Franchise sort already derives franchise from the title
--     - Storyline sort now uses incident_year (a real, meaningful value)
--
--   The legacy position columns are KEPT for backward-compat with
--   existing rows; they're just no longer edited by the admin UI.
--
-- Safe to re-run: uses IF NOT EXISTS.

ALTER TABLE curated_universe_entries
  ADD COLUMN IF NOT EXISTS incident_year INT;

COMMENT ON COLUMN curated_universe_entries.incident_year IS
  'The in-universe year this title takes place (e.g. 1943 for Captain America: The First Avenger, 1995 for Captain Marvel). Used by the Storyline sort order. NULL = unknown; falls back to story_position.';

-- Index for efficient Storyline sort (incident_year ASC NULLS LAST).
CREATE INDEX IF NOT EXISTS curated_universe_entries_incident_year_idx
  ON curated_universe_entries (universe_id, incident_year);
