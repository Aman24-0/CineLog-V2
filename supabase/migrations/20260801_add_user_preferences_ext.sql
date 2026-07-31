-- 20260801_add_user_preferences_ext.sql
-- ---------------------------------------------------------------------
-- Extends the existing user_preferences table with a prefs_json JSONB
-- column to store preferences that don't have a dedicated column.
--
-- The existing columns (theme, accent_color, density, etc.) cover the
-- core preferences that the DB needs to know about for server-side
-- logic (e.g. adult_content for RLS policies). The prefs_json column
-- is a catch-all for client-only prefs (notification settings, quiet
-- hours, calendar prefs, sync cadence, etc.) that drive the UI but
-- don't need server-side enforcement.
--
-- This is additive — no existing columns are changed, no data is lost.
-- ---------------------------------------------------------------------

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS prefs_json JSONB DEFAULT '{}'::jsonb;
