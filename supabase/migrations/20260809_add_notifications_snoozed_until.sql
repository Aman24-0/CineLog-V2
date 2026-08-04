-- 20260809_add_notifications_snoozed_until.sql
--
-- Phase 6 Part 3 — Task 1 (Notifications & Reminders)
--
-- Adds a `snoozed_until` column to the `notifications` table so the
-- user can snooze individual notifications. When snoozed, the
-- notification is hidden from the active feed until the snooze period
-- elapses (calculated client-side; the column just stores the
-- until-timestamp).
--
-- The column is nullable. NULL = not snoozed. A non-null value in the
-- future = snoozed. A non-null value in the past = snooze expired
-- (treated the same as NULL by the client).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- Backfill existing rows so they appear as "not snoozed".
UPDATE public.notifications
  SET snoozed_until = NULL
  WHERE snoozed_until IS NULL;

-- Index for the "active feed" query: a notification is in the active
-- feed if (snoozed_until IS NULL OR snoozed_until <= now()). This
-- partial index covers the NULL case (the common one) so the feed
-- query stays fast even with thousands of snoozed rows.
CREATE INDEX IF NOT EXISTS notifications_user_active_idx
  ON public.notifications(user_id, created_at DESC)
  WHERE snoozed_until IS NULL;
