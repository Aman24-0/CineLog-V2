-- CineLog V2 — Audio Languages Cache
-- ---------------------------------------------------------------------
-- Stores cached dubbed-audio language information per TMDB title.
--
-- Composite key: (media_type, tmdb_id) — matches the tmdb_cache pattern.
-- The full per-source raw payload + normalized result is kept in `data`.
-- `expires_at` controls the TTL (default 14 days, see worker.ts).
-- `fetched_at` records the last time the worker ran successfully.
--
-- RLS: same as tmdb_cache — world-readable for cache reads, writes only
-- via the service role (server-side API routes). Anonymous users can
-- READ this table (it's shared metadata, not user-specific).
-- ---------------------------------------------------------------------

create table if not exists public.audio_languages_cache (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id bigint not null,
  data jsonb not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_type, tmdb_id)
);

create index if not exists audio_languages_cache_expires_at_idx
  on public.audio_languages_cache (expires_at);

create index if not exists audio_languages_cache_media_tmdb_idx
  on public.audio_languages_cache (media_type, tmdb_id);

-- Enable RLS. Allow anon + authenticated to READ (cache is shared metadata).
-- Writes go through the service role, which bypasses RLS.
alter table public.audio_languages_cache enable row level security;

drop policy if exists "audio_languages_cache_world_read" on public.audio_languages_cache;
create policy "audio_languages_cache_world_read"
  on public.audio_languages_cache
  for select
  using (true);

-- No INSERT/UPDATE/DELETE policies — only the service role (server-side)
-- can write, since it bypasses RLS entirely.
