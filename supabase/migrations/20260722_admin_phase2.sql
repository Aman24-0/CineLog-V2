-- ============================================================================
-- CineLog V2 — Admin Panel Phase 2
-- ----------------------------------------------------------------------------
-- Adds:
--   1. announcements table — banner/toast/modal notices shown to all users
--   2. featured_content table — admin-curated hero/rail/spotlight/pinned slots
--   3. homepage_sections row in app_config — toggle + reorder Discover sections
--
-- All new tables use the same RLS pattern as Phase 1:
--   • Public read (USING (true))
--   • Admin-only writes (checks profiles.is_admin = TRUE AND admin_disabled_at IS NULL)
--
-- Audit logging reuses the existing admin_actions table from Phase 1.
-- ============================================================================

-- ─── 1. ANNOUNCEMENTS ─────────────────────────────────────────────────────

create type announcement_type as enum ('banner', 'toast', 'modal');
create type announcement_severity as enum ('info', 'success', 'warning', 'error');

create table if not exists public.announcements (
  id              uuid primary key default gen_random_uuid(),
  type            announcement_type      not null default 'banner',
  severity        announcement_severity  not null default 'info',
  title           text                   not null,
  body            text,
  cta_label       text,
  cta_href        text,
  is_dismissible  boolean                not null default true,
  is_active       boolean                not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  target_audience text                   not null default 'all',  -- all|guests|authenticated
  created_by      uuid                   references public.profiles(id) on delete set null,
  created_at      timestamptz            not null default now(),
  updated_at      timestamptz            not null default now(),
  deleted_at      timestamptz
);

create index if not exists idx_announcements_active_window
  on public.announcements (is_active, starts_at, ends_at)
  where deleted_at is null;

create index if not exists idx_announcements_type
  on public.announcements (type)
  where deleted_at is null;

alter table public.announcements enable row level security;

-- Public can read non-deleted announcements
drop policy if exists "announcements_public_read" on public.announcements;
create policy "announcements_public_read" on public.announcements
  for select using (deleted_at is null);

-- Admins can do everything
drop policy if exists "announcements_admin_all" on public.announcements;
create policy "announcements_admin_all" on public.announcements
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
        and p.admin_disabled_at is null
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
        and p.admin_disabled_at is null
        and p.deleted_at is null
    )
  );

-- updated_at trigger
create or replace function public.tg_announcements_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_announcements_updated_at on public.announcements;
create trigger trg_announcements_updated_at
  before update on public.announcements
  for each row execute function public.tg_announcements_updated_at();

-- ─── 2. FEATURED CONTENT ──────────────────────────────────────────────────

create type featured_slot as enum ('hero', 'spotlight', 'rail', 'pinned', 'editor_pick');

create table if not exists public.featured_content (
  id              uuid primary key default gen_random_uuid(),
  slot            featured_slot  not null,
  tmdb_id         integer        not null,
  media_type      media_type     not null,  -- reuses existing enum (movie|tv)
  title_override  text,                                       -- optional custom display title
  note            text,                                       -- internal admin note (not shown to users)
  tagline         text,                                       -- short marketing line shown on hero/spotlight
  position        integer        not null default 0,
  is_active       boolean        not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_by      uuid           references public.profiles(id) on delete set null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),
  deleted_at      timestamptz,
  unique (slot, tmdb_id, media_type)
);

create index if not exists idx_featured_content_slot_active
  on public.featured_content (slot, position)
  where deleted_at is null and is_active = true;

create index if not exists idx_featured_content_tmdb
  on public.featured_content (tmdb_id, media_type)
  where deleted_at is null;

alter table public.featured_content enable row level security;

-- Public can read active featured content
drop policy if exists "featured_content_public_read" on public.featured_content;
create policy "featured_content_public_read" on public.featured_content
  for select using (deleted_at is null);

-- Admins can do everything
drop policy if exists "featured_content_admin_all" on public.featured_content;
create policy "featured_content_admin_all" on public.featured_content
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
        and p.admin_disabled_at is null
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
        and p.admin_disabled_at is null
        and p.deleted_at is null
    )
  );

create or replace function public.tg_featured_content_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_featured_content_updated_at on public.featured_content;
create trigger trg_featured_content_updated_at
  before update on public.featured_content
  for each row execute function public.tg_featured_content_updated_at();

-- ─── 3. HOMEPAGE SECTIONS CONFIG ──────────────────────────────────────────
--
-- Stored as a single JSONB row in app_config (key = 'homepage_sections').
-- Shape:
--   {
--     "sections": {
--       "genre_explorer":     { "enabled": true,  "order": 1 },
--       "spotlight":          { "enabled": true,  "order": 2 },
--       "continue_universes": { "enabled": true,  "order": 3 },
--       "insight_strip":      { "enabled": true,  "order": 4 },
--       "trending":           { "enabled": true,  "order": 5 },
--       "theatres":           { "enabled": true,  "order": 6 },
--       "because_you_love":   { "enabled": true,  "order": 7 },
--       "surprise_me":        { "enabled": true,  "order": 8 },
--       "weekend_picks":      { "enabled": true,  "order": 9 },
--       "step_outside":       { "enabled": true,  "order": 10 },
--       "hidden_gems":        { "enabled": true,  "order": 11 },
--       "top_rated_movies":   { "enabled": true,  "order": 12 },
--       "top_rated_series":   { "enabled": true,  "order": 13 },
--       "new_on_ott":         { "enabled": true,  "order": 14 },
--       "new_seasons":        { "enabled": true,  "order": 15 },
--       "coming_soon":        { "enabled": true,  "order": 16 }
--     }
--   }
--
-- The consumer app reads this via /api/homepage-config (public endpoint).
-- Missing keys default to enabled=true with order=999 (rendered last).

insert into public.app_config (key, value, updated_by)
values (
  'homepage_sections',
  '{
    "sections": {
      "genre_explorer":     { "enabled": true, "order": 1 },
      "spotlight":          { "enabled": true, "order": 2 },
      "continue_universes": { "enabled": true, "order": 3 },
      "insight_strip":      { "enabled": true, "order": 4 },
      "trending":           { "enabled": true, "order": 5 },
      "theatres":           { "enabled": true, "order": 6 },
      "because_you_love":   { "enabled": true, "order": 7 },
      "surprise_me":        { "enabled": true, "order": 8 },
      "weekend_picks":      { "enabled": true, "order": 9 },
      "step_outside":       { "enabled": true, "order": 10 },
      "hidden_gems":        { "enabled": true, "order": 11 },
      "top_rated_movies":   { "enabled": true, "order": 12 },
      "top_rated_series":   { "enabled": true, "order": 13 },
      "new_on_ott":         { "enabled": true, "order": 14 },
      "new_seasons":        { "enabled": true, "order": 15 },
      "coming_soon":        { "enabled": true, "order": 16 }
    }
  }'::jsonb,
  null
)
on conflict (key) do nothing;

-- ─── 4. SEED SAMPLE ANNOUNCEMENT (optional, can be deleted) ───────────────

insert into public.announcements (type, severity, title, body, is_active, target_audience)
values (
  'banner',
  'info',
  'Welcome to CineLog V2',
  'Discover, track, and curate your movie & TV universe. New admin tools are now live.',
  false,  -- disabled by default; admin can flip on
  'all'
)
on conflict do nothing;

-- ─── 5. VERIFY ────────────────────────────────────────────────────────────

do $$
begin
  raise notice 'Phase 2 migration complete. New tables: announcements, featured_content. New app_config row: homepage_sections.';
end;
$$;
