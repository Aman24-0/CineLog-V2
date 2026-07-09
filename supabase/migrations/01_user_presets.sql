-- Phase 12.1 — user_presets table
-- Production-ready migration for Vault Presets (eliminates final Firebase dependency)

-- Table
CREATE TABLE IF NOT EXISTS user_presets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  version     smallint    NOT NULL DEFAULT 1 CHECK (version > 0),
  filters     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_presets_user_id ON user_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_presets_user_id_created_at ON user_presets(user_id, created_at);

-- Trigger (reuse existing set_updated_at() function)
DROP TRIGGER IF EXISTS trg_user_presets_set_updated_at ON user_presets;
CREATE TRIGGER trg_user_presets_set_updated_at
  BEFORE UPDATE ON user_presets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE user_presets ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "user_presets_owner_select" ON user_presets;
CREATE POLICY "user_presets_owner_select" ON user_presets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presets_owner_insert" ON user_presets;
CREATE POLICY "user_presets_owner_insert" ON user_presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presets_owner_update" ON user_presets;
CREATE POLICY "user_presets_owner_update" ON user_presets
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presets_owner_delete" ON user_presets;
CREATE POLICY "user_presets_owner_delete" ON user_presets
  FOR DELETE USING (auth.uid() = user_id);
