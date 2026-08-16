-- supabase/migrations/20260818_justwatch_ott_migration.sql
--
-- CineLog V2 — JustWatch OTT Migration — Chunk 1
-- ---------------------------------------------------------------------
-- Foundation schema for the TMDB → JustWatch OTT data migration.
--
-- Three tables are introduced in this chunk:
--
-- 1. justwatch_provider_catalog
--      Mirror of JustWatch's `packages(country, platform: WEB)` for the
--      user's country. Each row carries the `icon_template` returned by
--      the JustWatch GraphQL `Package.icon` field — the template is of
--      the form `/icon/{numericId}/{profile}/{technicalName}.{format}`
--      and the consumer substitutes {profile}/{format} and prefixes
--      with `https://images.justwatch.com`.
--      Refreshed weekly (or on user-country change).
--
-- 2. justwatch_title_mapping
--      TMDB → JustWatch node ID resolution cache. After a successful
--      `searchJustWatchTitle` lookup, we persist the mapping so future
--      requests for the same (media_type, tmdb_id, country) skip the
--      search and go straight to `node(id)` for offers.
--      TTL enforced by `expires_at`; resolver re-resolves when expired.
--
-- 3. ott_availability_cache
--      Per-title per-country offer payload cache. Stores the full
--      JustWatch offers array as JSONB so the client can render the
--      "Where to Watch" panel without re-querying JustWatch on every
--      details-page load. TTL enforced by `expires_at`.
--
-- RLS is intentionally NOT added in this chunk. Later chunks will add
-- RLS policies once the API routes that read/write these tables are
-- landed.

create table if not exists public.justwatch_provider_catalog (
  country text not null,
  package_id text not null,
  clear_name text not null,
  short_name text not null,
  technical_name text not null,
  icon_template text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (country, technical_name)
);

create index if not exists idx_jw_catalog_country
  on public.justwatch_provider_catalog(country);

create table if not exists public.justwatch_title_mapping (
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id bigint not null,
  country text not null,
  justwatch_node_id text not null,
  resolved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (media_type, tmdb_id, country)
);

create index if not exists idx_jw_mapping_reverse
  on public.justwatch_title_mapping(justwatch_node_id, country);

create table if not exists public.ott_availability_cache (
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id bigint not null,
  country text not null,
  justwatch_node_id text not null,
  offers jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (media_type, tmdb_id, country)
);

-- RLS is intentionally not added in this chunk.
-- Later chunks will add RLS policies.
