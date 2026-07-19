-- ============================================================
-- CineLog V2 — Performance Fix: Remaining Database Changes
-- 
-- Run this in: Supabase Dashboard → SQL Editor
-- 
-- What this does:
--   1. Adds unique constraint on tmdb_cache(media_type, tmdb_id)
--      — required for upsert with onConflict
--   2. Creates the idx_tmdb_cache_expires index (plain, no now())
--      — the original migration failed on this due to now() not being IMMUTABLE
--   3. Verifies all other indexes exist (idempotent with IF NOT EXISTS)
-- ============================================================

-- ─── 1. Unique constraint on tmdb_cache ────────────────────────
-- The upsert in the API route uses onConflict: "media_type,tmdb_id".
-- Without this constraint, upsert would fail.
-- Using UNIQUE constraint instead of just an index so that
-- onConflict knows which columns to check.

-- First check if it already exists, add only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tmdb_cache_media_type_tmdb_id_key'
  ) THEN
    ALTER TABLE public.tmdb_cache 
      ADD CONSTRAINT tmdb_cache_media_type_tmdb_id_key 
      UNIQUE (media_type, tmdb_id);
  END IF;
END $$;

-- ─── 2. Expiration index (fixed — no now() in predicate) ───────
-- The original migration failed with error 42P17 because now() 
-- is VOLATILE, not IMMUTABLE. PostgreSQL requires IMMUTABLE 
-- expressions in index predicates.
CREATE INDEX IF NOT EXISTS idx_tmdb_cache_expires 
  ON public.tmdb_cache (expires_at);

-- ─── 3. Verify other indexes exist (idempotent) ───────────────
-- These were created before the migration failed, but run again
-- with IF NOT EXISTS to be safe.

-- Vault indexes (partial, where deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_vault_active 
  ON public.vault (user_id, created_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vault_status 
  ON public.vault (user_id, status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vault_identity 
  ON public.vault (user_id, tmdb_id, media_type) 
  WHERE deleted_at IS NULL;

-- Episode progress indexes
CREATE INDEX IF NOT EXISTS idx_ep_latest 
  ON public.episode_progress (vault_id, watched_at DESC NULLS LAST, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ep_vault_id 
  ON public.episode_progress (vault_id);

-- tmdb_cache lookup index
CREATE INDEX IF NOT EXISTS idx_tmdb_cache_media_lookup 
  ON public.tmdb_cache (media_type, tmdb_id);

-- ─── Done! ─────────────────────────────────────────────────────
-- Verify with:
--   SELECT indexname, indexdef FROM pg_indexes 
--     WHERE tablename IN ('vault', 'episode_progress', 'tmdb_cache');
--   SELECT conname, contype FROM pg_constraint 
--     WHERE conrelid = 'public.tmdb_cache'::regclass;
