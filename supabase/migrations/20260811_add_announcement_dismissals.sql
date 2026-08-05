-- 20260811_add_announcement_dismissals.sql
--
-- Phase 9 Chunk 4 — Communication Hub: announcement dismissal tracking.
--
-- This table records every user/guest dismissal of an announcement so
-- the admin Communication Hub can show per-announcement dismissal
-- counts (a measure of how "annoying" or "seen" each announcement
-- is). Dismissals are recorded server-side (not just localStorage)
-- so they survive browser data clears and aggregate across devices.
--
-- Schema:
--   • announcement_id  — FK to announcements.id (CASCADE on delete)
--   • profile_id       — FK to profiles.id, NULL for guests
--   • guest_hash       — sha256(IP + User-Agent), NULL for authenticated
--                         users. Lets us dedupe guest dismissals per
--                         browser without storing PII.
--   • dismissed_at     — timestamptz, defaults to now()
--
-- RLS:
--   • Anyone (including guests) can INSERT their own dismissal.
--   • Only admins can SELECT (aggregated counts only — no PII exposed
--     via the admin endpoint, which returns counts grouped by
--     announcement_id, not raw rows).
--   • No one can UPDATE or DELETE — dismissals are immutable.
--
-- Indexes:
--   • (announcement_id) — for the admin aggregate query.
--   • (profile_id, announcement_id) — for the per-user "already
--      dismissed" check (future enhancement).

create table if not exists public.announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null
    references public.announcements(id) on delete cascade,
  profile_id uuid
    references public.profiles(id) on delete set null,
  guest_hash text,
  dismissed_at timestamstatz not null default now(),
  -- A dismissal is either by a known user OR a guest (never both,
  -- never neither). Enforced via a check constraint so a buggy
  -- caller can't insert a half-populated row.
  constraint dismissals_either_user_or_guest
    check (
      (profile_id is not null and guest_hash is null)
      or
      (profile_id is null and guest_hash is not null)
    )
);

create index if not exists idx_dismissals_announcement
  on public.announcement_dismissals (announcement_id);

create index if not exists idx_dismissals_profile_announcement
  on public.announcement_dismissals (profile_id, announcement_id);

create index if not exists idx_dismissals_guest_hash_announcement
  on public.announcement_dismissals (guest_hash, announcement_id);

-- Row-level security.
alter table public.announcement_dismissals enable row level security;

-- Anyone can INSERT a dismissal. The endpoint enforces that the
-- profile_id (if present) matches the caller's session, so a user
-- can't forge dismissals under another user's id.
drop policy if exists "dismissals_anyone_insert" on public.announcement_dismissals;
create policy "dismissals_anyone_insert"
  on public.announcement_dismissals for insert
  to anon, authenticated
  with check (true);

-- Admins can read all dismissals (for aggregated stats). Users can
-- read their own dismissals (for the "already dismissed" check).
drop policy if exists "dismissals_admin_select_all" on public.announcement_dismissals;
create policy "dismissals_admin_select_all"
  on public.announcement_dismissals for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
        and p.admin_disabled_at is null
    )
    or profile_id = auth.uid()
  );

-- Guests (anon) cannot read any dismissals — they only need to
-- write their own. The "already dismissed" check for guests is
-- handled client-side via localStorage (see lib/announcements.ts).

-- No UPDATE or DELETE policies — dismissals are immutable.
