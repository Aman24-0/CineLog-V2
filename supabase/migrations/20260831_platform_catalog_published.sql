-- supabase/migrations/20260831_platform_catalog_published.sql
--
-- CineLog V2 — Part 4 redesign — Published Platform Catalogue
-- ---------------------------------------------------------------------
-- Evolves the existing `justwatch_provider_catalog` table (introduced
-- by `20260818_justwatch_ott_migration.sql`) from a TTL-cached mirror
-- of JustWatch's `packages(country, platform: WEB)` endpoint into a
-- PUBLISHED catalogue that admins explicitly manage.
--
-- CHANGES:
--   1. Add `active boolean not null default true` — distinguishes
--      published (active = true) rows from unpublished / soft-deleted
--      (active = false) rows. The user-side Library Platform filter
--      reads ONLY rows with `active = true`. The admin can flip a
--      row to `active = false` to retire a provider without losing
--      the metadata (so the next JustWatch fetch can re-publish it
--      trivially if it reappears).
--
--   2. Add `last_fetched_at timestamptz` — the timestamp of the most
--      recent JustWatch fetch that confirmed the row's metadata is
--      still current. Distinct from the existing `fetched_at` column
--      (the original insert timestamp) and `expires_at` (now
--      de-emphasized for the published catalogue). The admin UI uses
--      `last_fetched_at` to show "last seen in JustWatch fetch on…".
--
--   3. Add `published_at timestamptz` — when the admin published
--      (flipped `active` to true). NULL for rows auto-published by
--      the migration's backfill. Useful for audit logging.
--
--   4. Add `updated_at timestamptz` — bumped by the admin on
--      metadata edits (clearName / shortName / icon_template
--      corrections). Initial value = `fetched_at` for backfilled
--      rows. Drives the admin "UPDATED" badge in the catalogue
--      comparison view (a row whose `clear_name` etc. diverged from
--      the latest JustWatch fetch).
--
--   5. Index on `(country, active)` for the user-side read path
--      (`getPublishedProviderCatalog`).
--
--   6. Drop the existing `expires_at` filter semantics for published
--      rows. The column is KEPT (for backward compat with the
--      existing cache layer that still uses it for the title-mapping
--      and availability tables) but `getPublishedProviderCatalog`
--      does NOT filter on `expires_at > now()` — published rows do
--      NOT expire. Admin-controlled refresh is the source of truth.
--
--   7. Backfill: every existing row (typically the rows written by
--      the old `getProviderCatalog` JustWatch-fallback path) becomes
--      `active = true`, `published_at = null`, `updated_at = fetched_at`.
--      This means the current India catalogue (which was auto-fetched)
--      is preserved as the initial published catalogue — users see
--      no regression.
--
-- IDEMPOTENT: every ALTER / CREATE is guarded with IF NOT EXISTS or a
-- DO $$ block so re-running the migration on an already-migrated
-- database is safe. The backfill UPDATE is idempotent because the
-- columns are NOT NULL with defaults — re-running leaves the
-- populated values untouched.
--
-- See:
--   src/server/justwatch/cache.ts → getPublishedProviderCatalog
--   src/routes/api/ott/providers.ts → user-side catalogue read
--   src/routes/api/admin/platform-catalog/* → admin management
--   src/features/admin/AdminPlatformCatalogPage.tsx → admin UI

-- ─── 1. Add the `active` column (published flag) ─────────────────────

alter table public.justwatch_provider_catalog
  add column if not exists active boolean not null default true;

-- ─── 2. Add `last_fetched_at` (most recent JustWatch fetch) ──────────

alter table public.justwatch_provider_catalog
  add column if not exists last_fetched_at timestamptz;

-- ─── 3. Add `published_at` (admin publish action timestamp) ─────────

alter table public.justwatch_provider_catalog
  add column if not exists published_at timestamptz;

-- ─── 4. Add `updated_at` (admin metadata edit timestamp) ────────────

alter table public.justwatch_provider_catalog
  add column if not exists updated_at timestamptz;

-- ─── 5. Index for the user-side published-catalogue read path ───────

create index if not exists idx_jw_catalog_country_active
  on public.justwatch_provider_catalog(country, active);

-- ─── 6. Backfill existing rows as published (active = true) ────────
-- The existing catalogue (typically auto-fetched for IN by the old
-- `getProviderCatalog` JustWatch-fallback path) becomes the initial
-- published catalogue so users see no regression.
--
-- `last_fetched_at` is backfilled from `fetched_at` (the original
-- insert timestamp). `updated_at` is also backfilled from `fetched_at`
-- so the admin "UPDATED" comparison has a sensible initial value.
-- `published_at` is left NULL for backfilled rows (it's only set
-- when the admin explicitly publishes a NEW row).
--
-- The backfill is idempotent — re-running leaves the populated
-- values untouched (the COALESCE keeps the existing non-null value).

update public.justwatch_provider_catalog
  set
    active = true,
    last_fetched_at = coalesce(last_fetched_at, fetched_at),
    updated_at = coalesce(updated_at, fetched_at)
  where
    active is null
    or last_fetched_at is null
    or updated_at is null;

-- ─── 7. RLS: existing policy (`jw_provider_catalog_select`) already
-- grants SELECT to anon + authenticated. The new `active` column is
-- automatically covered by the existing USING (true) policy — no RLS
-- changes needed.
--
-- INSERT/UPDATE/DELETE remain service-role-only (no policy for anon
-- / authenticated). The admin API routes use the admin service client
-- (which bypasses RLS), so they can mutate the table freely. The
-- existing `requireAdmin` guard on those routes ensures only
-- authenticated admins reach them.
