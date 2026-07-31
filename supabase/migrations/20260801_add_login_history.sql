-- 20260801_add_login_history.sql
-- ---------------------------------------------------------------------
-- Login history table — tracks every successful sign-in for each user.
-- Used by the Settings → Account → Login History section so users can
-- see "was my account accessed from an unknown device?".
--
-- RLS policy: a user can only SELECT / INSERT their own rows. Updates
-- and deletes are NOT allowed via the anon/authenticated client —
-- that would let a malicious user tamper with their audit trail.
-- Admins can manage rows via the service-role client.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the common "fetch recent logins for a user" query.
CREATE INDEX IF NOT EXISTS login_history_user_id_login_at_idx
  ON login_history (user_id, login_at DESC);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

-- A user can read their own login history.
DROP POLICY IF EXISTS login_history_select ON login_history;
CREATE POLICY login_history_select ON login_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A user can insert a row for themselves (called from the client on
-- successful sign-in). The IP and user-agent are read from the
-- request headers server-side, but for the simplest client-side
-- implementation we also allow the client to insert with whatever
-- values it can detect (navigator.userAgent). A server-side insert
-- via an RPC could be added later for more trustworthy IP capture.
DROP POLICY IF EXISTS login_history_insert ON login_history;
CREATE POLICY login_history_insert ON login_history
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
