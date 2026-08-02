-- 20260729_add_archived_at_to_collections.sql
--
-- Adds archive support for user collections and explicit ordering
-- for collection_entries (used by the drag-to-reorder feature on
-- user folders). Also introduces the universe_phases table — admin-
-- authored phase dividers for curated universes (the user-side
-- detail page reads these rows and renders them as section headers;
-- nothing is hardcoded).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. collections.archived_at
-- ──────────────────────────────────────────────────────────────────────────
-- NULL = active (default). Non-null = archived (hidden from the main
-- Collections grid unless the user toggles "Show Archived").
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_collections_archived_at
  ON collections(archived_at);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. collection_entries.order_index
-- ──────────────────────────────────────────────────────────────────────────
-- Drag-to-reorder for USER collections only. Curated universes use the
-- position / story_position / release_position columns on
-- curated_universe_entries (managed by the admin).
ALTER TABLE collection_entries
  ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_collection_entries_order
  ON collection_entries(collection_id, order_index);

-- Backfill order_index from the existing 1-based `position` column so
-- existing folders start in their current visual order.
UPDATE collection_entries
SET order_index = position
WHERE order_index = 0 AND position IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. universe_phases (admin-authored phase dividers for curated universes)
-- ──────────────────────────────────────────────────────────────────────────
-- Examples:
--   { label: "Phase 1", order_index: 1, description: "Avengers Assemble" }
--   { label: "Phase 2", order_index: 2, description: "Dark World onwards" }
--
-- The user-side CollectionDetailPage renders these as section headers
-- BETWEEN entries when viewing a curated universe. The user has NO
-- edit access — phases are managed entirely in the admin panel.
CREATE TABLE IF NOT EXISTS universe_phases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id  UUID NOT NULL REFERENCES curated_universes(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  description  TEXT,
  -- The entry this divider appears BEFORE. NULL = render at the very
  -- top of the timeline (a "Phase 0" intro). The user page walks
  -- the sorted entries in order; whenever it encounters the entry
  -- whose id matches `before_entry_id`, it renders the phase header
  -- first, then the entry.
  --
  -- Stored as TEXT (not UUID) so it can hold either a
  -- curated_universe_entries.id (UUID) OR a TMDB id (number-as-string).
  -- The admin UI stores the TMDB id because that is what the consumer
  -- CollectionEntry.id exposes — keeping the match logic simple.
  before_entry_id TEXT,
  -- Manual sort order for phases when multiple exist. Lower comes first.
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_universe_phases_universe
  ON universe_phases(universe_id, order_index);

-- RLS — admin-only writes; any signed-in user can read (subscribed
-- universes are visible to everyone who has subscribed).
--
-- Uses the SAME admin predicate as admin_phase1/2/3 migrations:
--   profiles.is_admin = TRUE AND admin_disabled_at IS NULL
-- (NOT profiles.role = 'admin' — that column does not exist on this
-- project's profiles table; using it causes "column profiles.role
-- does not exist" at policy-create time.)
ALTER TABLE universe_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "universe_phases_read" ON universe_phases;
CREATE POLICY "universe_phases_read" ON universe_phases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "universe_phases_admin_write" ON universe_phases;
CREATE POLICY "universe_phases_admin_write" ON universe_phases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );
