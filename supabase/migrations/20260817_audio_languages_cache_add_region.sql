-- CineLog V2 — Audio Languages Cache: Add region to cache key
-- ---------------------------------------------------------------------
-- Background: JustWatch offer.audioLanguages is region-specific. A
-- cache entry written for region="IN" must NEVER be returned for a
-- request with region="DE", because the dubbed-audio availability
-- differs by country. The original 20260816 migration used
-- UNIQUE (media_type, tmdb_id), which caused cross-region
-- contamination when the same title was queried from two countries.
--
-- Fix (spec §12): include `region` in the unique constraint so each
-- (media_type, tmdb_id, region) tuple is cached independently.
--
-- This migration is idempotent and safe to re-run.
-- ---------------------------------------------------------------------

-- Add the column. Default to 'US' so pre-existing rows (which were
-- written under the old (media_type, tmdb_id) key, almost always for
-- region='IN' due to the previous hard-coded default) get a non-null
-- value. They will be re-fetched under the correct region on next
-- access and naturally overwritten.
alter table public.audio_languages_cache
  add column if not exists region text not null default 'US';

-- Validate format: ISO 3166-1 alpha-2 (2 uppercase letters).
alter table public.audio_languages_cache
  add constraint audio_languages_cache_region_format
  check (region ~ '^[A-Z]{2}$');

-- Drop the old (media_type, tmdb_id) unique constraint + index.
alter table public.audio_languages_cache
  drop constraint if exists audio_languages_cache_media_type_tmdb_id_key;

drop index if exists audio_languages_cache_media_tmdb_idx;

-- Add the new (media_type, tmdb_id, region) unique constraint.
alter table public.audio_languages_cache
  add constraint audio_languages_cache_media_tmdb_region_key
  unique (media_type, tmdb_id, region);

-- New lookup index matching the new unique key.
create index if not exists audio_languages_cache_media_tmdb_region_idx
  on public.audio_languages_cache (media_type, tmdb_id, region);
