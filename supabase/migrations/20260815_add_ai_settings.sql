-- 20260815_add_ai_settings.sql
--
-- Phase 16 Chunk 1 — AI Integration (Groq): Control Center defaults.
--
-- Inserts a new row into the existing public.app_config key/value store
-- with the key 'ai_settings'. The value is a JSONB object with three
-- boolean flags that the Admin AI Control Center (/admin/ai) toggles
-- without redeploying:
--
--   • masterEnabled              — Global kill switch. When false, EVERY
--                                   AI feature (server-side too) is off.
--                                   This is the emergency stop.
--   • userRecommendationsEnabled — Gates the AI section on the public
--                                   Discover page (user-facing). When
--                                   false, the Discover page does NOT
--                                   render the AI recommendations rail,
--                                   and the public /api/ai/status route
--                                   reports userRecommendationsEnabled=false
--                                   so the client can short-circuit.
--   • adminAssistantEnabled      — Gates the AI chat assistant inside
--                                   the admin panel. This flag is NEVER
--                                   exposed to the public status route —
--                                   it is read server-side only (via
--                                   checkAiSettings() in src/lib/server/groq.ts)
--                                   and via the admin-only
--                                   /api/admin/settings GET route.
--
-- SECURITY / DEFAULTS:
--   All three flags default to FALSE. AI is OFF by default. An admin
--   must explicitly opt-in via /admin/ai before any Groq API call is
--   made. This is required by the Phase 16 spec: "All off by default."
--
-- The app_config table already exists (created in 20260721_admin_phase1.sql)
-- with: key TEXT PK, value JSONB NOT NULL, updated_at TIMESTAMPTZ,
-- updated_by UUID. RLS allows public SELECT and admin-only writes — so
-- the public /api/ai/status route can read this row with the anon key,
-- and only admins can mutate it via /api/admin/settings PUT.
--
-- This migration is IDEMPOTENT: running it twice will not overwrite
-- the row if an admin has already toggled flags, because of the
-- ON CONFLICT DO NOTHING clause. This is important for re-deploys.

INSERT INTO public.app_config (key, value)
VALUES (
  'ai_settings',
  '{
    "masterEnabled": false,
    "userRecommendationsEnabled": false,
    "adminAssistantEnabled": false
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Verify the row exists (helps when running the migration manually
-- via psql — the SELECT confirms the JSONB shape landed correctly).
DO $$
DECLARE
  v jsonb;
BEGIN
  SELECT value INTO v FROM public.app_config WHERE key = 'ai_settings';
  IF v IS NULL THEN
    RAISE WARNING 'ai_settings row missing after insert — check RLS / app_config schema';
  END IF;
END $$;
