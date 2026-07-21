-- 20260724_universe_default_view_franchise.sql
--
-- CineLog V2 — Add 'franchise' to the universe_default_view_type enum.
--
-- Background
-- ----------
-- The curated_universes.default_view column controls which sort mode
-- users land on when they open a universe's detail page on the consumer
-- side. As of v2.2 we expose three unified sort modes — Storyline,
-- Release Year, Franchise — so admins need to be able to pick Franchise
-- as the default. The DB enum previously only had
--   ('timeline', 'release', 'story')
-- and the adapter mapped both 'timeline' and 'story' onto the Storyline
-- UI option, leaving no way to default users into the Franchise view.
--
-- This migration is idempotent — re-running it is a no-op.
-- ===========================================================================

-- Add 'franchise' to the existing enum type. PostgreSQL's ALTER TYPE
-- ADD VALUE is non-transactional but idempotent-safe inside an IF NOT
-- EXISTS guard (PG 9.3+).
ALTER TYPE public.universe_default_view_type
  ADD VALUE IF NOT EXISTS 'franchise';

-- Refresh the generated database.types.ts hint comment so the next
-- `supabase gen types` run picks up the new value. No-op for the DB.
COMMENT ON TYPE public.universe_default_view_type IS
  'Allowed default sort orders for a curated universe. Values: timeline (legacy, maps to story), release, story, franchise.';
