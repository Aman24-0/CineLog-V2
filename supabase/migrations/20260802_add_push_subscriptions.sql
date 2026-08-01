-- 20260802_add_push_subscriptions.sql
-- ---------------------------------------------------------------------
-- Phase 2 — Task 13: Web Push Notifications
-- ---------------------------------------------------------------------
-- Stores per-user Web Push subscriptions (one row per browser/device).
-- A user may have many subscriptions: laptop browser, phone PWA, work
-- computer, etc. When a notification needs to be delivered, the server
-- iterates every row for that user and calls web-push.sendNotification.
--
-- Schema:
--   id           — surrogate primary key
--   user_id      — FK to profiles(id) ON DELETE CASCADE (so account
--                  deletion automatically cleans up subscriptions)
--   endpoint     — the unique URL FCM/APNS/Mozilla assigns to the
--                  subscription. Used as the natural key for upserts
--                  and for deletion on unsubscribe.
--   keys         — JSONB { p256dh, auth } — the client-side encryption
--                  keys needed by web-push to encrypt the payload.
--   expires_at   — when the subscription expires (Firefox/Mozilla sets
--                  this; we filter expired rows out at send time).
--   created_at   — bookkeeping
--   updated_at   — bookkeeping; updated on every upsert
--
-- RLS:
--   Owner-only (auth.uid() = user_id). Users can manage their own
--   subscriptions but never anyone else's. INSERT/UPDATE/DELETE/SELECT
--   all gated.
--
-- UNIQUE(user_id, endpoint):
--   The same browser calling subscribe() twice returns the same
--   endpoint (per the Web Push spec). The UNIQUE constraint lets us
--   upsert safely — if a user re-subscribes on a device that already
--   has a row, we just refresh the keys + expires_at.
--
-- VAPID public key:
--   The public key is exposed to the browser so it can be passed to
--   pushManager.subscribe({ applicationServerKey }). We store it in
--   app_config (single source of truth) so the admin can rotate it
--   without redeploying. The private key stays server-only (env var
--   VAPID_PRIVATE_KEY) and is NEVER stored in the database.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Index for fast lookup of all subscriptions for a user (used by the
-- /api/push/send endpoint when delivering a notification).
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions(user_id);

-- Index for filtering out expired subscriptions at send time.
CREATE INDEX IF NOT EXISTS push_subscriptions_expires_idx
  ON public.push_subscriptions(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT — owner can list their own subscriptions (used by the browser
-- to check whether a subscription already exists on this device).
DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT — owner can add a new subscription for themselves.
DROP POLICY IF EXISTS "push_subscriptions_insert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE — owner can refresh their own subscription keys / expiry.
DROP POLICY IF EXISTS "push_subscriptions_update" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE — owner can unsubscribe their own devices.
DROP POLICY IF EXISTS "push_subscriptions_delete" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── updated_at trigger ────────────────────────────────────────────
-- Auto-update updated_at on every row update. Matches the pattern used
-- by other tables in the schema.

CREATE OR REPLACE FUNCTION public.set_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_push_subscriptions_updated_at();

-- ─── VAPID public key in app_config ────────────────────────────────
-- Stored as a JSONB string value (e.g. "BK2v...==") so the browser can
-- fetch it via the public read of app_config. RLS on app_config allows
-- public SELECT, so anonymous users can also fetch it (needed during
-- the subscribe flow before the user is fully authenticated — though
-- in practice we only subscribe signed-in users).
--
-- The actual key value must be set by an admin via:
--   UPDATE app_config SET value = to_jsonb('<public-key>'::text)
--   WHERE key = 'vapid_public_key';
-- or via the Supabase dashboard. Until then, the empty-string
-- placeholder means push subscriptions will fail gracefully (the hook
-- detects the empty key and shows "Push not configured" in the UI).

INSERT INTO public.app_config (key, value)
VALUES ('vapid_public_key', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;
