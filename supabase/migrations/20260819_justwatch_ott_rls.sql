-- supabase/migrations/20260819_justwatch_ott_rls.sql
--
-- CineLog V2 — JustWatch OTT Migration — Chunk 3 — RLS Policies
-- ---------------------------------------------------------------------
-- Enables Row-Level Security on the three JustWatch OTT tables
-- introduced by `20260818_justwatch_ott_migration.sql`:
--
--   • justwatch_provider_catalog
--   • justwatch_title_mapping
--   • ott_availability_cache
--
-- Policy model (mirrors `audio_languages_cache`):
--   - SELECT: world-readable for anon + authenticated. The cached
--     provider catalog, title mappings, and offer payloads are shared
--     metadata — they are NOT user-specific. The country column does
--     not need RLS protection because the data for "IN" is not secret
--     from a "DE" user; it's just a different cache key.
--   - INSERT/UPDATE/DELETE: NO policies for anon/authenticated. Only
--     the service role (server-side API routes via
--     `src/server/justwatch/cache.ts`) can write, since the service
--     role bypasses RLS entirely.
--
-- Idempotent: uses `drop policy if exists` before each `create policy`
-- so re-running the migration on an already-migrated database is safe.

-- ─── Enable RLS ────────────────────────────────────────────────────

alter table public.justwatch_provider_catalog enable row level security;
alter table public.justwatch_title_mapping enable row level security;
alter table public.ott_availability_cache enable row level security;

-- ─── justwatch_provider_catalog — world-readable SELECT ───────────

drop policy if exists "jw_provider_catalog_select"
  on public.justwatch_provider_catalog;

create policy "jw_provider_catalog_select"
  on public.justwatch_provider_catalog
  for select
  to anon, authenticated
  using (true);

-- ─── justwatch_title_mapping — world-readable SELECT ──────────────

drop policy if exists "jw_title_mapping_select"
  on public.justwatch_title_mapping;

create policy "jw_title_mapping_select"
  on public.justwatch_title_mapping
  for select
  to anon, authenticated
  using (true);

-- ─── ott_availability_cache — world-readable SELECT ───────────────

drop policy if exists "ott_availability_cache_select"
  on public.ott_availability_cache;

create policy "ott_availability_cache_select"
  on public.ott_availability_cache
  for select
  to anon, authenticated
  using (true);

-- ─── Writes ────────────────────────────────────────────────────────
-- No INSERT/UPDATE/DELETE policies for anon/authenticated. Only the
-- service role (server-side `cache.ts` writes) can mutate these
-- tables, since the service role bypasses RLS entirely. This matches
-- the `audio_languages_cache` write model.
