-- 20260812_backfill_reminder_title_name.sql
--
-- Backfill title_name for existing user_reminders rows.
-- The vault table does not store title/poster data, so we rely
-- exclusively on the notifications table.

-- Step 0: Guarantee the target columns exist (idempotent).
ALTER TABLE user_reminders
  ADD COLUMN IF NOT EXISTS title_name  VARCHAR DEFAULT '';
ALTER TABLE user_reminders
  ADD COLUMN IF NOT EXISTS poster_path VARCHAR;

-- Normalize any NULLs to empty string so our filter works consistently.
UPDATE user_reminders
   SET title_name = ''
 WHERE title_name IS NULL;

-- Step 1: Backfill remaining rows from notifications table.
-- When a reminder was scheduled, a notification was inserted with
-- title like "Reminder set: <titleName>". Extract the name from there.
UPDATE user_reminders r
SET title_name = regexp_replace(n.title, '^Reminder set: ', '')
FROM notifications n
WHERE (r.title_name IS NULL OR r.title_name = '')
  AND n.related_title_id   = r.tmdb_id
  AND n.related_title_type = r.title_type
  AND n.type   = 'reminder'
  AND n.title  LIKE 'Reminder set: %'
  AND n.user_id = r.user_id;
