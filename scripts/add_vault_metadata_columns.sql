-- CineLog V2 — Add Display Metadata Columns to Vault Table
-- ---------------------------------------------------------------------
-- Performance fix: The watchlist loading pipeline fetches TMDB metadata
-- for every vault item on every page load. For users with 1000+ items,
-- this means 1000+ individual TMDB API calls taking ~8-10 seconds.
--
-- This migration adds display metadata columns to the vault table so
-- metadata is written once (at add-time) and read on every load without
-- TMDB API calls. This reduces watchlist load time from ~10s to ~1-2s.
--
-- Run this in the Supabase SQL Editor.

-- Add display metadata columns (nullable — populated on next write)
ALTER TABLE vault
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS poster_path text,
  ADD COLUMN IF NOT EXISTS backdrop_path text,
  ADD COLUMN IF NOT EXISTS release_date text,
  ADD COLUMN IF NOT EXISTS first_air_date text,
  ADD COLUMN IF NOT EXISTS tmdb_vote_average numeric,
  ADD COLUMN IF NOT EXISTS genres jsonb;

-- Add a comment documenting the columns
COMMENT ON COLUMN vault.title IS
  'TMDB display title for movies. Populated at add-time to avoid re-fetching from TMDB on every load.';
COMMENT ON COLUMN vault.name IS
  'TMDB display name for TV series. Populated at add-time.';
COMMENT ON COLUMN vault.poster_path IS
  'TMDB poster path (e.g. /abc123.jpg). Populated at add-time.';
COMMENT ON COLUMN vault.backdrop_path IS
  'TMDB backdrop path. Populated at add-time.';
COMMENT ON COLUMN vault.release_date IS
  'TMDB release date string. Populated at add-time.';
COMMENT ON COLUMN vault.first_air_date IS
  'TMDB first air date string. Populated at add-time.';
COMMENT ON COLUMN vault.tmdb_vote_average IS
  'TMDB vote_average (0-10). Populated at add-time.';
COMMENT ON COLUMN vault.genres IS
  'TMDB genres array as JSON. Populated at add-time.';
