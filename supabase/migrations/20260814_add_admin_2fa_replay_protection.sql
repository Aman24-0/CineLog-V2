-- 20260814_add_admin_2fa_replay_protection.sql
-- ---------------------------------------------------------------------
-- Phase 13 Chunk 2 — Bug #4: TOTP Replay Protection
-- ---------------------------------------------------------------------
-- Adds a `last_used_counter` column to `admin_2fa_secrets` so the
-- /api/admin/2fa/verify and /disable routes can reject TOTP codes
-- whose underlying time-step counter is older than or equal to the
-- last successfully-used counter.
--
-- WHY:
--   RFC 6238 TOTP codes are valid for ~30 seconds (one step), and
--   we accept codes within a ±1 step window (±30s) to tolerate
--   clock drift between the user's phone and the server. That means
--   a single 6-digit code is accepted for up to 90 seconds.
--
--   Without replay protection, an attacker who intercepts a valid
--   code (e.g. via a phishing page, screenshot, or shoulder-surfing)
--   can reuse it within that 90-second window. The 2FA "something
--   you have" factor is weakened to a one-time password that's
--   actually valid up to three times.
--
--   The fix is to track the highest counter we've accepted for each
--   admin and reject any code whose counter is <= that value. Since
--   the counter strictly increases over time (it's
--   floor(unix_time / 30)), this means each TOTP code can be used
--   at most ONCE, even within the ±1 window.
--
-- SCHEMA:
--   last_used_counter INTEGER  — nullable for backward compat.
--     NULL = no successful verification yet (initial state).
--     On every successful verify/disable, we update this to the
--     counter that produced the accepted code.
--
--     The counter is a positive integer; for the next ~9 million
--     years it fits in INT (32-bit signed int maxes out at
--     2_147_483_647 — at 1 counter per 30s, that's ~2041 years).
--     We use INTEGER (not BIGINT) for Supabase JS compatibility
--     (the auto-generated types map INTEGER to number, which is
--     safe for values up to 2^53; BIGINT is also mapped to number
--     but JSON-serialization loses precision above 2^53).
--
-- IDEMPOTENT: uses ADD COLUMN IF NOT EXISTS so re-running the
-- migration is safe (matches the project's migration policy).
-- ---------------------------------------------------------------------

ALTER TABLE public.admin_2fa_secrets
  ADD COLUMN IF NOT EXISTS last_used_counter INTEGER;

-- Add an index to speed up the lookup-by-admin-id query that the
-- verify route uses. The PRIMARY KEY on admin_id already provides
-- this, but the index makes the query plan explicit + future-proofs
-- against schema changes (e.g. if we ever switch to a composite key).
-- Partial: only index rows where 2FA is enabled (the verify route
-- only ever looks at enabled rows).
CREATE INDEX IF NOT EXISTS idx_admin_2fa_last_used_counter
  ON public.admin_2fa_secrets(admin_id, last_used_counter)
  WHERE enabled_at IS NOT NULL;

-- Comment for future schema-readers + the auto-generated docs.
COMMENT ON COLUMN public.admin_2fa_secrets.last_used_counter IS
  'TOTP replay protection: the highest time-step counter that has been '
  'accepted by /api/admin/2fa/verify or /disable. Codes whose counter '
  'is <= this value are rejected. NULL = no successful verify yet.';
