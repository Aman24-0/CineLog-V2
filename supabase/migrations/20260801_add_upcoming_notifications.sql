-- 20260801_add_upcoming_notifications.sql
--
-- Upcoming Page redesign — persistence layer for release-day reminders
-- and the in-app notification feed.
--
-- Two tables:
--   notifications     — the user's in-app notification feed (reminders,
--                       watchlist_added, season_available, etc.). Rows
--                       are visible in the Notification Center sheet.
--   user_reminders    — the user's "Remind Me" subscriptions for
--                       upcoming titles. Each row is a (user, tmdb_id)
--                       pair with the release date; the page reads this
--                       to decide whether the bell icon on a card is on.
--
-- RLS: owner-only on both tables (auth.uid() = user_id).

-- ─── notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL,            -- 'reminder' | 'watchlist_added' | 'season_available' | ...
  related_title_id TEXT,         -- TMDB ID (as text — vault uses TEXT tmdb_id)
  related_title_type TEXT,       -- 'movie' | 'series' | 'episode'
  scheduled_for TIMESTAMPTZ,     -- when the notification should fire
  sent_at TIMESTAMPTZ,           -- when the notification was actually delivered
  read_at TIMESTAMPTZ,           -- when the user dismissed / opened it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications(user_id) WHERE is_read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_read" ON notifications;
CREATE POLICY "notifications_read" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── user_reminders ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tmdb_id TEXT NOT NULL,
  title_type TEXT NOT NULL,        -- 'movie' | 'series'
  title_name TEXT NOT NULL DEFAULT '',  -- display name for the reminder
  poster_path TEXT,                -- TMDB poster path for the reminder
  release_date DATE NOT NULL,
  is_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tmdb_id)
);

CREATE INDEX IF NOT EXISTS user_reminders_user_idx
  ON user_reminders(user_id);
CREATE INDEX IF NOT EXISTS user_reminders_release_idx
  ON user_reminders(release_date) WHERE is_scheduled = TRUE AND notification_sent = FALSE;

ALTER TABLE user_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_reminders_read" ON user_reminders;
CREATE POLICY "user_reminders_read" ON user_reminders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_reminders_insert" ON user_reminders;
CREATE POLICY "user_reminders_insert" ON user_reminders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_reminders_delete" ON user_reminders;
CREATE POLICY "user_reminders_delete" ON user_reminders
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
