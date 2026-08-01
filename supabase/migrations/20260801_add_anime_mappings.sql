-- 20260801_add_anime_mappings.sql
-- AniList Integration — Phase 0
-- ---------------------------------------------------------------------
-- Creates the `anime_mappings` table that links TMDB ids to AniList
-- ids. This is the "join table" that lets CineLog know which AniList
-- record to query for anime enrichment (characters, voice actors,
-- relations, airing schedule, etc.) when the user opens a TMDB-sourced
-- anime title.
--
-- TMDB remains the PRIMARY metadata provider for everything (movies,
-- TV, anime). AniList is used ONLY for anime-specific enrichment.
-- MDBList remains the ratings provider.
--
-- Schema:
--   id           uuid pk (gen_random_uuid)
--   tmdb_id      integer  UNIQUE NOT NULL  — TMDB movie/tv id
--   tmdb_type    text     'movie' | 'tv'   — which TMDB entity
--   anilist_id   integer  NOT NULL         — AniList Media.id
--   anilist_type text     'ANIME' | 'MANGA' — AniList Media.type
--   title        text                      — display title at mapping time
--   match_confidence text 'high' | 'medium' | 'low' | 'manual'
--                                              — how the mapping was made
--   created_by   text     'system' | 'admin' | user-id
--   created_at   timestamptz DEFAULT now()
--   updated_at   timestamptz DEFAULT now()
--
-- Indexes:
--   anime_mappings_tmdb_id_unique  — UNIQUE on (tmdb_id) so lookups
--                                     by TMDB id are O(1) and the
--                                     upsert path is race-safe.
--   anime_mappings_anilist_id_idx  — non-unique on (anilist_id) for
--                                     reverse lookup (recommendations).
--   anime_mappings_tmdb_type_idx   — for filtering by type.
--
-- RLS:
--   Public read — mappings are world-readable metadata (not user data).
--   Authenticated users can insert/update (auto‑mapping).
--   Service role bypasses RLS for admin operations.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anime_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id         integer NOT NULL,
  tmdb_type       text   NOT NULL DEFAULT 'tv'
                    CHECK (tmdb_type IN ('movie', 'tv')),
  anilist_id      integer NOT NULL,
  anilist_type    text   NOT NULL DEFAULT 'ANIME'
                    CHECK (anilist_type IN ('ANIME', 'MANGA')),
  title           text,
  match_confidence text  NOT NULL DEFAULT 'medium'
                    CHECK (match_confidence IN ('high', 'medium', 'low', 'manual')),
  created_by      text   NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint so upserts are race-safe and lookups by tmdb_id
-- are O(1) via the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS anime_mappings_tmdb_id_unique
  ON anime_mappings (tmdb_id);

-- Non-unique index for reverse lookups (e.g. "given an AniList id,
-- find the TMDB id" — used by recommendations and discover carousels).
CREATE INDEX IF NOT EXISTS anime_mappings_anilist_id_idx
  ON anime_mappings (anilist_id);

-- Index for filtering by tmdb_type when looking up a movie-only or
-- tv-only mapping (rarely needed, but cheap).
CREATE INDEX IF NOT EXISTS anime_mappings_tmdb_type_idx
  ON anime_mappings (tmdb_type);

-- updated_at auto-touch trigger so we can see when a mapping was last
-- refreshed. Reuse the same pattern as other CineLog tables.
CREATE OR REPLACE FUNCTION touch_anime_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS anime_mappings_touch_updated_at ON anime_mappings;
CREATE TRIGGER anime_mappings_touch_updated_at
  BEFORE UPDATE ON anime_mappings
  FOR EACH ROW
  EXECUTE FUNCTION touch_anime_mappings_updated_at();

-- ─── Row Level Security ────────────────────────────────────────────
-- Mappings are global metadata (like tmdb_cache), not user-owned data.
-- Public read access is required so anonymous users can see AniList
-- enrichment on the Details page.
-- Authenticated users can insert/update so that auto‑mapping works
-- from the browser (the app writes new mappings after discovering them).
-- Service role bypasses RLS completely (admin panel + server-side tasks).

ALTER TABLE anime_mappings ENABLE ROW LEVEL SECURITY;

-- Public read — anyone (including anon) can read mappings.
DROP POLICY IF EXISTS anime_mappings_read_all ON anime_mappings;
CREATE POLICY anime_mappings_read_all ON anime_mappings
  FOR SELECT USING (true);

-- Authenticated users can write (insert/update) to enable auto‑mapping.
DROP POLICY IF EXISTS anime_mappings_write_all ON anime_mappings;
CREATE POLICY anime_mappings_write_all ON anime_mappings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── App config entry for anime admin settings ────────────────────
-- Insert a default anime_settings JSONB blob into the existing
-- app_config table (created by admin Phase 3 migration). The Admin
-- Panel will read/write this via /api/admin/settings.
--
-- All flags default to TRUE so the anime carousels appear on first
-- deploy without any admin configuration. The admin can disable
-- individual carousels via /admin/anime.
INSERT INTO app_config (key, value)
VALUES (
  'anime_settings',
  '{
    "enabled": true,
    "seasonal_carousel": true,
    "trending_carousel": true,
    "upcoming_carousel": true,
    "top_rated_carousel": true,
    "hidden_gems_carousel": true,
    "popular_carousel": true,
    "anime_movies_carousel": true,
    "characters_staff": true,
    "relations": true,
    "airing_schedule": true,
    "opening_ending_themes": true,
    "auto_mapping": true,
    "api_timeout_ms": 10000,
    "cache_ttl_details_hours": 24,
    "cache_ttl_trending_hours": 6,
    "cache_ttl_seasonal_hours": 6,
    "cache_ttl_upcoming_hours": 12,
    "rate_limit_buffer_percent": 10
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
