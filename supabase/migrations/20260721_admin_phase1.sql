-- ============================================================
-- CineLog V2 — Admin Panel Phase 1 Migration
-- Date: 2026-07-21
--
-- What this does:
--   1. Adds is_admin + admin_disabled_at columns to profiles
--   2. Creates admin_actions audit log table (append-only)
--   3. Creates app_config table for feature flags + global settings
--   4. Adds RLS policies for admin-only access on admin_actions
--   5. Adds RLS policies for app_config (public read, admin write)
--   6. Adds an RLS policy preventing self-modification of is_admin
--   7. Seeds default feature flags
-- ============================================================

-- ─── 1. profiles: add admin columns ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_disabled_at TIMESTAMPTZ;

-- Index for fast admin lookup
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
  ON public.profiles (is_admin)
  WHERE is_admin = TRUE;

-- ─── 2. admin_actions audit log (append-only) ─────────────────
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id
  ON public.admin_actions (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action
  ON public.admin_actions (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_entity
  ON public.admin_actions (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

-- Enable RLS
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Admins can read all admin actions
DROP POLICY IF EXISTS admin_actions_select ON public.admin_actions;
CREATE POLICY admin_actions_select ON public.admin_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );

-- Any authenticated user can INSERT (server-side logging via service_role)
-- but in practice only the server inserts. We still require auth.uid() to be set.
DROP POLICY IF EXISTS admin_actions_insert ON public.admin_actions;
CREATE POLICY admin_actions_insert ON public.admin_actions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- NO UPDATE or DELETE policy → append-only is enforced at the database level.
-- Even service_role bypasses RLS, but the application layer never issues UPDATE/DELETE.

-- ─── 3. app_config table (feature flags + global settings) ──────
-- Single-table key/value store with JSONB values. Used for:
--   - feature_flags (JSONB object of flag_name → boolean)
--   - global settings (maintenance_mode, min_app_version, etc.)
--   - cache stats (tmdb_cache_hits, tmdb_cache_misses)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Public read access (feature flags + settings are not secret)
DROP POLICY IF EXISTS app_config_select ON public.app_config;
CREATE POLICY app_config_select ON public.app_config
  FOR SELECT USING (true);

-- Admin-only write access
DROP POLICY IF EXISTS app_config_insert ON public.app_config;
CREATE POLICY app_config_insert ON public.app_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );

DROP POLICY IF EXISTS app_config_update ON public.app_config;
CREATE POLICY app_config_update ON public.app_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );

DROP POLICY IF EXISTS app_config_delete ON public.app_config;
CREATE POLICY app_config_delete ON public.app_config
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
    )
  );

-- Trigger to bump updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.bump_app_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON public.app_config;
CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_app_config_updated_at();

-- ─── 4. Prevent users from self-promoting to admin ────────────
-- RLS policy: users can update their own profile, but NOT the is_admin column.
-- This is a defense-in-depth measure. The application never lets users touch
-- is_admin directly, but if a bug or SQL injection ever allowed it, this policy
-- would block the privilege escalation.
--
-- Strategy: We use a trigger to enforce immutability of is_admin and
-- admin_disabled_at for non-admin users. RLS UPDATE policy only checks
-- row-level access; column-level immutability needs a trigger.
--
-- The trigger fires BEFORE UPDATE and raises an exception if a non-admin
-- user tries to change is_admin or admin_disabled_at.

CREATE OR REPLACE FUNCTION public.protect_admin_columns()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
  is_current_admin BOOLEAN := FALSE;
BEGIN
  -- Get the current user ID (NULL if service_role / anon / not authenticated)
  current_user_id := auth.uid();
  
  -- If no authenticated user, this is a service_role operation — allow it
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if the current user is an admin
  SELECT COALESCE(is_admin, FALSE) AND admin_disabled_at IS NULL
    INTO is_current_admin
  FROM public.profiles
  WHERE id = current_user_id;
  
  -- Admins can modify these columns
  IF is_current_admin THEN
    RETURN NEW;
  END IF;
  
  -- For non-admins: block changes to is_admin or admin_disabled_at
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    RAISE EXCEPTION 'Non-admin users cannot modify is_admin';
  END IF;
  IF OLD.admin_disabled_at IS DISTINCT FROM NEW.admin_disabled_at THEN
    RAISE EXCEPTION 'Non-admin users cannot modify admin_disabled_at';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_admin_columns ON public.profiles;
CREATE TRIGGER trg_protect_admin_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns();

-- ─── 5. Seed default feature flags ────────────────────────────
INSERT INTO public.app_config (key, value) VALUES
  ('feature_flags', '{
    "imdb_integration": true,
    "streaming_button": true,
    "upcoming": true,
    "random_picker": true,
    "ai_recommendations": false,
    "experimental_features": false
  }'::jsonb),
  ('global_settings', '{
    "maintenance_mode": false,
    "min_app_version": "0.0.0",
    "default_theme": "matrix",
    "default_language": "en",
    "default_image_quality": "high"
  }'::jsonb),
  ('tmdb_cache_stats', '{
    "hits": 0,
    "misses": 0
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 6. Promote the owner to admin ────────────────────────────
-- dahayataman@gmail.com — the project owner's Supabase auth email.
-- We match on the auth.users.email → profiles.id relationship.
-- The profiles table's id column references auth.users.id, so we
-- need to look up the user's id via auth.users.
--
-- NOTE: This must be run with service_role / postgres privileges
-- because auth.users is not accessible to anon/authenticated roles.
UPDATE public.profiles
SET is_admin = TRUE,
    admin_disabled_at = NULL
WHERE id = (
  SELECT au.id
  FROM auth.users au
  WHERE au.email = 'dahayataman@gmail.com'
);

-- ─── Done ─────────────────────────────────────────────────────
-- Verify the admin was promoted (will return 0 rows if the email is wrong)
-- Run this query manually in Supabase SQL Editor to verify:
--   SELECT id, username, display_name, is_admin
--   FROM public.profiles
--   WHERE is_admin = TRUE;
