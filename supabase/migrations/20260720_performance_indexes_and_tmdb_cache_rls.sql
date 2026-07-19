-- ============================================================
-- CineLog V2 — Performance Fix: TMDB Cache RLS + Performance Indexes
-- 
-- Run this ENTIRE script in: Supabase Dashboard → SQL Editor
-- 
-- What this does:
--   1. Adds public read + authenticated write RLS policies on tmdb_cache
--   2. Creates performance indexes on vault table
--   3. Creates performance indexes on episode_progress table
--   4. Creates indexes on tmdb_cache table
-- ============================================================

-- ─── 1. tmdb_cache RLS policies ────────────────────────────────
-- The table already exists but RLS blocks reads from anon/authenticated.
-- These policies make tmdb_cache readable by everyone (it's shared metadata,
-- not user-specific) and writable by authenticated users.

-- Allow all users (including anon) to read tmdb_cache
CREATE POLICY "tmdb_cache_select" ON public.tmdb_cache
  FOR SELECT USING (true);

-- Allow authenticated users to insert
CREATE POLICY "tmdb_cache_insert" ON public.tmdb_cache
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update
CREATE POLICY "tmdb_cache_update" ON public.tmdb_cache
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow service_role full access (already implied, but explicit is better)
-- Note: service_role bypasses RLS by default, so no policy needed.

-- ─── 2. Performance indexes on vault table ─────────────────────
-- Every vault query filters by user_id + deleted_at IS NULL.
-- Without these partial indexes, PostgreSQL must scan all rows
-- including soft-deleted ones, then filter.

-- Primary query pattern: all non-deleted items for a user, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_vault_active 
  ON public.vault (user_id, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Status-filtered queries (watchlist tabs: All / Watching / Planned / etc.)
CREATE INDEX IF NOT EXISTS idx_vault_status 
  ON public.vault (user_id, status) 
  WHERE deleted_at IS NULL;

-- Composite key lookup (used by getVaultItem / getVaultByTmdbId)
CREATE INDEX IF NOT EXISTS idx_vault_identity 
  ON public.vault (user_id, tmdb_id, media_type) 
  WHERE deleted_at IS NULL;

-- ─── 3. Performance indexes on episode_progress table ──────────
-- The batch query fetches all rows for multiple vault_ids, ordered
-- by watched_at DESC, then picks the latest per vault_id client-side.

-- Latest progress lookup (used by getLatestEpisodeProgressBatch)
CREATE INDEX IF NOT EXISTS idx_ep_latest 
  ON public.episode_progress (vault_id, watched_at DESC NULLS LAST, updated_at DESC);

-- FK index on vault_id (may exist via constraint, but ensure it)
CREATE INDEX IF NOT EXISTS idx_ep_vault_id 
  ON public.episode_progress (vault_id);

-- ─── 4. Indexes on tmdb_cache table ───────────────────────────
-- Batch lookup: given a list of (media_type, tmdb_id) pairs, find all
CREATE INDEX IF NOT EXISTS idx_tmdb_cache_media_lookup 
  ON public.tmdb_cache (media_type, tmdb_id);

-- Expiration cleanup: find stale entries that need refresh
-- NOTE: We cannot use `WHERE expires_at < now()` in a partial index because
-- now() is VOLATILE (not IMMUTABLE), and PostgreSQL requires IMMUTABLE
-- expressions in index predicates (error 42P17). Instead, use a plain index
-- on expires_at; the cleanup query filters at runtime.
CREATE INDEX IF NOT EXISTS idx_tmdb_cache_expires 
  ON public.tmdb_cache (expires_at);

-- ─── Done! ─────────────────────────────────────────────────────
-- Verify with:
--   SELECT * FROM tmdb_cache LIMIT 5;
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('vault', 'episode_progress', 'tmdb_cache');
