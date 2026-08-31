-- supabase/migrations/20260901_profile_location_and_activity_fields.sql
--
-- CineLog V2 — Profile location + vault activity fields
-- ---------------------------------------------------------------------
-- Adds:
--   profiles.state  (TEXT, nullable) — ISO 3166-2 subdivision code
--                   OR a human-readable state/province name. We use a
--                   TEXT column (not a FK) so the field is flexible
--                   enough for any country's subdivision scheme
--                   (e.g. "IN-MP" for Madhya Pradesh, "US-CA" for
--                   California, OR just "Madhya Pradesh"). The app
--                   normalizes to a stable identifier at write time.
--   profiles.city   (TEXT, nullable) — city name (e.g. "Rewa").
--
--   vault.reaction              (TEXT, nullable) — one of the common
--                               reaction vocabulary (loved_it, funny,
--                               sad, shocked, scared, thoughtful,
--                               angry, bored). NULL = no reaction.
--   vault.watch_device          (TEXT, nullable) — where the user
--                               watched: tv, computer, tablet, mobile.
--   vault.watch_platform        (TEXT, nullable) — JustWatch
--                               technicalName of the platform the
--                               user watched on (e.g. "netflix"). NULL
--                               = not set / unknown.
--   vault.favorite_character_id (TEXT, nullable) — TMDB person id
--                               (cast.id) of the favourite character.
--   vault.favorite_character_name (TEXT, nullable) — character name
--                               (cast.character) for display fallback.
--   vault.favorite_character_profile (TEXT, nullable) — TMDB profile
--                               path for the character's actor image.
--
-- All new columns are NULLABLE so existing rows are NOT broken. The
-- app treats NULL as "not set" and renders the appropriate empty
-- state for each field.
--
-- No CHECK constraints are added — the app validates values before
-- writing, and a CHECK would make future vocabulary changes harder.
--
-- Idempotent: every ALTER is guarded with IF NOT EXISTS.

-- ─── profiles: state + city ─────────────────────────────────────────

alter table public.profiles
  add column if not exists state text;

alter table public.profiles
  add column if not exists city text;

-- ─── vault: activity fields ────────────────────────────────────────

alter table public.vault
  add column if not exists reaction text;

alter table public.vault
  add column if not exists watch_device text;

alter table public.vault
  add column if not exists watch_platform text;

alter table public.vault
  add column if not exists favorite_character_id text;

alter table public.vault
  add column if not exists favorite_character_name text;

alter table public.vault
  add column if not exists favorite_character_profile text;

-- ─── Indexes ──────────────────────────────────────────────────────
-- No additional indexes needed — the new columns are not used in
-- WHERE clauses for the existing query paths. The vault table is
-- already indexed on (user_id, deleted_at) for the primary library
-- fetch. Reaction/device/platform/character are only read when the
-- vault item is already loaded.

-- ─── RLS ──────────────────────────────────────────────────────────
-- The existing RLS policies on profiles and vault cover all columns
-- automatically (the policies use `using (auth.uid() = user_id)` or
-- equivalent, which applies to the whole row). No new RLS policies
-- are needed for the new columns.
