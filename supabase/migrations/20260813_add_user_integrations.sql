-- 20260813_add_user_integrations.sql
--
-- Phase 12 Chunk 2 — Trakt Backend (OAuth & API Routes)
--
-- Adds the `user_integrations` table that stores per-user OAuth tokens
-- for third-party providers (Trakt first; structured so we can add
-- Simkl, MAL, etc. later by extending the `provider` TEXT column).
--
-- SECURITY MODEL:
--   • Access + refresh tokens are stored here, server-side only.
--   • RLS is ENABLED. Only the owning user (user_id = auth.uid()) can
--     SELECT / INSERT / UPDATE / DELETE their own rows.
--   • API routes use the service-role admin client to read tokens,
--     bypassing RLS — but the service-role key NEVER reaches the
--     browser bundle. The browser never sees the token values.
--   • A UNIQUE (user_id, provider) constraint enforces "one Trakt
--     account per CineLog account" — re-connecting simply upserts.
--
-- SCHEMA:
--   id                UUID  — primary key (gen_random_uuid)
--   user_id           UUID  — FK to profiles.id, ON DELETE CASCADE
--   provider          TEXT  — 'trakt' | 'simkl' | 'mal' | ... (NOT NULL)
--   access_token      TEXT  — OAuth access token (NOT NULL)
--   refresh_token     TEXT  — OAuth refresh token (nullable; some
--                             providers issue non-expiring tokens)
--   provider_user_id  TEXT  — Trakt username (e.g. "john_doe")
--   provider_email    TEXT  — Trakt account email (used for the
--                             email-mismatch security check)
--   expires_at        TIMESTAMPTZ — when the access_token expires
--                                   (NULL = token doesn't expire)
--   created_at        TIMESTAMPTZ DEFAULT now()
--   updated_at        TIMESTAMPTZ DEFAULT now()
--
-- RLS POLICIES (owner-only):
--   • user_integrations_self_select   — SELECT WHERE user_id = auth.uid()
--   • user_integrations_self_insert   — INSERT WITH CHECK user_id = auth.uid()
--   • user_integrations_self_update   — UPDATE WHERE user_id = auth.uid()
--                                        WITH CHECK user_id = auth.uid()
--   • user_integrations_self_delete   — DELETE WHERE user_id = auth.uid()

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  provider_user_id  TEXT,
  provider_email    TEXT,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One account per provider per user. Re-connecting the same provider
-- upserts the existing row instead of creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_integrations_user_provider
  ON public.user_integrations(user_id, provider);

-- Index for fast lookups by provider (e.g. "find all Trakt connections
-- whose token is about to expire"). Useful for future refresh cron.
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider
  ON public.user_integrations(provider);

CREATE INDEX IF NOT EXISTS idx_user_integrations_expires_at
  ON public.user_integrations(expires_at)
  WHERE expires_at IS NOT NULL;

-- ─── Row Level Security ────────────────────────────────────────────
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_integrations_self_select" ON public.user_integrations;
CREATE POLICY "user_integrations_self_select"
  ON public.user_integrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_integrations_self_insert" ON public.user_integrations;
CREATE POLICY "user_integrations_self_insert"
  ON public.user_integrations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_integrations_self_update" ON public.user_integrations;
CREATE POLICY "user_integrations_self_update"
  ON public.user_integrations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_integrations_self_delete" ON public.user_integrations;
CREATE POLICY "user_integrations_self_delete"
  ON public.user_integrations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_user_integrations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_integrations_updated_at ON public.user_integrations;
CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_integrations_updated_at();
