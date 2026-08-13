-- CineLog V2 — OTT Provider Availability Cache
-- ---------------------------------------------------------------------
-- Stores cached JustWatch provider availability per TMDB title.
--
-- Composite key: (media_type, tmdb_id, region) — region is part of the key
-- because JustWatch offer data is region-specific. A row written for
-- region="IN" must NEVER be returned for a "DE" request.
--
-- RLS: same as audio_languages_cache — world-readable for cache reads,
-- writes only via the service role (server-side). Anonymous users can
-- READ this table (it's shared metadata, not user-specific).
-- ---------------------------------------------------------------------

create table if not exists public.ott_provider_availability (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id bigint not null,
  region text not null check (length(region) = 2),
  data jsonb not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_type, tmdb_id, region)
);

create index if not exists ott_provider_availability_expires_at_idx
  on public.ott_provider_availability (expires_at);

create index if not exists ott_provider_availability_media_tmdb_region_idx
  on public.ott_provider_availability (media_type, tmdb_id, region);

-- Enable RLS. Allow anon + authenticated to READ (cache is shared metadata).
-- Writes go through the service role, which bypasses RLS entirely.
alter table public.ott_provider_availability enable row level security;

drop policy if exists "ott_provider_availability_world_read" on public.ott_provider_availability;
create policy "ott_provider_availability_world_read"
  on public.ott_provider_availability
  for select
  using (true);

-- No INSERT/UPDATE/DELETE policies — only the service role (server-side)
-- can write, since it bypasses RLS entirely.
