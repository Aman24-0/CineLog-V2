-- supabase/migrations/20260902_drop_profile_state_add_city_search.sql
--
-- CineLog V2 — Drop profiles.state, keep profiles.city
-- ---------------------------------------------------------------------
-- The previous migration (20260901) added profiles.state + profiles.city
-- for a Country → State → City cascading selector. The product
-- requirement changed to Country → City (direct search, no State).
--
-- This migration:
--   1. DROPS the `state` column from `profiles` (no longer needed).
--   2. KEEPS the `city` column (already added by the previous migration).
--   3. Sets any existing non-null `state` values to NULL before dropping
--      (defensive — the column is nullable so this is a no-op for most
--      rows, but protects against any rows that might have been written
--      during the brief period the State feature was live).
--
-- The vault activity columns (reaction, watch_device, watch_platform,
-- favorite_character_id, favorite_character_name,
-- favorite_character_profile) added by 20260901 are KEPT — they are
-- used by the Activity Edit modal.
--
-- Idempotent: uses IF EXISTS guards.

-- 1. Clear any existing state values (defensive — most rows are NULL).
update public.profiles set state = null where state is not null;

-- 2. Drop the state column.
alter table public.profiles drop column if exists state;

-- No RLS changes needed — the existing policies cover all columns
-- automatically (they use `using (auth.uid() = id)` or equivalent,
-- which applies to the whole row).
