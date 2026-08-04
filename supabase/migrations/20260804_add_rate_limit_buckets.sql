-- 20260804_add_rate_limit_buckets.sql
-- ---------------------------------------------------------------------
-- Phase 1 — Task 1: DB-Backed Rate Limiting Infrastructure
-- ---------------------------------------------------------------------
-- Replaces the 5 in-memory Map-based rate limiters (which were no-ops
-- on Vercel serverless because every cold start reset the Map) with a
-- persistent Postgres table.
--
-- Every API route that previously kept a `Map<string, RateLimitEntry>`
-- now reads + writes through this table via the service-role Supabase
-- client. The table is keyed by (bucket, key):
--
--   bucket  — logical limiter name, e.g. "account_delete", "admin_auth",
--             "push_send", "push_status", "email_send", "admin_mutation".
--   key     — the rate-limit identity, e.g. an IP address for unauthed
--             endpoints, or "<admin_id>:<action>" for admin mutations,
--             or a user_id for per-user limits.
--
-- The row holds:
--   count          — number of events in the current window
--   window_start   — when the current window began (events before this
--                     are rolled over)
--   locked_until   — for failure-based limiters, the timestamp until
--                     which the key is hard-locked (set after N failures)
--   last_updated   — bookkeeping for manual inspection
--
-- RLS: the table is locked down to the service_role only. anon and
-- authenticated roles have NO access — rate-limit data is internal
-- server state and must never be readable or writable from the browser.
-- (service_role bypasses RLS by default, so the API routes can still
-- read/write it.)
--
-- INDEX STRATEGY:
--   PRIMARY KEY (bucket, key) — covers the upsert + lookup-by-key paths
--   partial index on locked_until — supports the periodic purge query
--     `DELETE WHERE locked_until < NOW()` without scanning the table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket        TEXT        NOT NULL,
  key           TEXT        NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until  TIMESTAMPTZ,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket, key)
);

-- Partial index for the purge query (only rows that are currently locked).
CREATE INDEX IF NOT EXISTS rate_limit_buckets_locked_until_idx
  ON public.rate_limit_buckets (locked_until)
  WHERE locked_until IS NOT NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────
-- The table MUST be service-role-only. Browser clients must not be able
-- to read or manipulate rate-limit state.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Revoke all direct table access from anon/authenticated roles.
REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;

-- Grant full access to the service role (used by createAdminClient()).
GRANT ALL ON public.rate_limit_buckets TO service_role;

-- Note: the postgres superuser and service_role bypass RLS by default,
-- so no explicit policy is needed — RLS simply blocks anon/authenticated.

-- ─── Atomic increment function ──────────────────────────────────────
-- Used by the rate-limiter helper to do an atomic "increment-and-get"
-- in a single round-trip. Returns the new count so the caller can
-- decide whether to allow the request.
--
-- Inputs:
--   p_bucket  — the bucket name
--   p_key     — the key within the bucket
--   p_window_ms — the window length in milliseconds (used to decide
--                 whether to reset the window)
--   p_lockout_ms — if > 0, lock the key for this long once count >= p_max
--   p_max     — the max events allowed in the window
--
-- Returns: JSONB with { allowed: bool, count: int, retry_after_ms: int }
--   - allowed = true if under the limit (and not currently locked)
--   - count = the new event count for this window
--   - retry_after_ms = ms until the lock expires (0 if not locked)
--
-- The function is SECURITY DEFINER so it can be invoked by the
-- service_role without needing separate SELECT/UPDATE permissions
-- granted at the table level. It only reads + mutates the
-- rate_limit_buckets table — no other side effects.

CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_bucket     TEXT,
  p_key        TEXT,
  p_window_ms  INTEGER,
  p_lockout_ms INTEGER DEFAULT 0,
  p_max        INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now        TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ;
  v_count      INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_allowed    BOOLEAN;
  v_retry_ms   INTEGER := 0;
BEGIN
  -- Try to fetch the existing row.
  SELECT window_start, count, locked_until
    INTO v_window_start, v_count, v_locked_until
    FROM public.rate_limit_buckets
    WHERE bucket = p_bucket AND key = p_key
    FOR UPDATE;

  -- Case 1: row exists and is currently locked.
  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'retry_after_ms', EXTRACT(EPOCH FROM (v_locked_until - v_now))::BIGINT * 1000
    );
  END IF;

  -- Case 2: row exists but window has expired → reset the window.
  IF v_window_start IS NOT NULL
     AND v_window_start < v_now - (p_window_ms || ' milliseconds')::INTERVAL THEN
    v_count := 0;
    v_window_start := v_now;
    v_locked_until := NULL;
  END IF;

  -- Case 3: no row yet → start a fresh window.
  IF v_window_start IS NULL THEN
    v_window_start := v_now;
    v_count := 0;
    v_locked_until := NULL;
  END IF;

  -- Increment the counter.
  v_count := v_count + 1;

  -- Decide whether to allow.
  IF p_max > 0 AND v_count > p_max THEN
    -- Over the limit. If lockout is configured, set the lock.
    IF p_lockout_ms > 0 THEN
      v_locked_until := v_now + (p_lockout_ms || ' milliseconds')::INTERVAL;
      v_retry_ms := p_lockout_ms;
      -- Reset the counter so the next window starts fresh after the lock.
      v_count := 0;
      v_window_start := v_now;
    ELSE
      v_retry_ms := EXTRACT(EPOCH FROM (v_window_start + (p_window_ms || ' milliseconds')::INTERVAL - v_now))::BIGINT * 1000;
      IF v_retry_ms < 0 THEN v_retry_ms := 0; END IF;
    END IF;
    v_allowed := false;
  ELSE
    v_allowed := true;
  END IF;

  -- Upsert the row with the new state.
  INSERT INTO public.rate_limit_buckets
    (bucket, key, count, window_start, locked_until, last_updated)
  VALUES
    (p_bucket, p_key, v_count, v_window_start, v_locked_until, v_now)
  ON CONFLICT (bucket, key) DO UPDATE
    SET count = v_count,
        window_start = v_window_start,
        locked_until = v_locked_until,
        last_updated = v_now;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'retry_after_ms', v_retry_ms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_rate_limit(TEXT, TEXT, INTEGER, INTEGER, INTEGER)
  TO service_role;

-- ─── Reset (clear) helper ───────────────────────────────────────────
-- Used by "clearFailures()" on successful auth — wipes the row so the
-- next failure starts fresh.
CREATE OR REPLACE FUNCTION public.reset_rate_limit(
  p_bucket TEXT,
  p_key    TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_buckets
    WHERE bucket = p_bucket AND key = p_key;
$$;

GRANT EXECUTE ON FUNCTION public.reset_rate_limit(TEXT, TEXT)
  TO service_role;

-- ─── "Is currently locked?" helper ──────────────────────────────────
-- Returns true if the key is currently hard-locked (locked_until > NOW).
-- Used by the failure-based limiters (account/delete, admin/auth) to
-- short-circuit before doing any work.
CREATE OR REPLACE FUNCTION public.is_rate_limited(
  p_bucket TEXT,
  p_key    TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.rate_limit_buckets
      WHERE bucket = p_bucket
        AND key = p_key
        AND locked_until IS NOT NULL
        AND locked_until > NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_rate_limited(TEXT, TEXT)
  TO service_role;
