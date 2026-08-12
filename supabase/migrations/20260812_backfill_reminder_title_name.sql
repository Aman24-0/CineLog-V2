-- 20260812_backfill_reminder_title_name.sql
--
-- Backfill title_name and poster_path for existing user_reminders rows
-- that were created before these columns were added (migration 20260801).
--
-- The columns were added with DEFAULT '' (title_name) and NULL (poster_path),
-- so existing rows have empty title_name and null poster_path. This migration
-- derives display-friendly values from the vault table where possible, and
-- from the notifications table as a fallback.
--
-- NOTE: This is a best-effort backfill. Rows that can't be matched will
-- retain their empty title_name. The UI (DesktopUtilityPanel) handles this
-- gracefully with a "Movie #<id>" / "Series #<id>" fallback.

-- Step 1: Backfill from the vault (most reliable source)
-- The vault stores tmdb_id, title/name, poster_path for items the user
-- has tracked. Match on user_id + tmdb_id.
UPDATE user_reminders r
SET
  title_name = COALESCE(
    v.title,
    v.name,
    'Movie'
  ),
  poster_path = v.poster_path
FROM vault v
WHERE r.title_name = ''
  AND r.user_id = v.user_id
  AND r.tmdb_id = v.tmdb_id::text;

-- Step 2: Backfill remaining rows from notifications table
-- When a reminder was scheduled, a notification was inserted with
-- title like "Reminder set: <titleName>". Extract the name from there.
UPDATE user_reminders r
SET title_name = regexp_replace(n.title, '^Reminder set: ', '')
FROM notifications n
WHERE r.title_name = ''
  AND n.related_title_id = r.tmdb_id
  AND n.related_title_type = r.title_type
  AND n.type = 'reminder'
  AND n.title LIKE 'Reminder set: %'
  AND n.user_id = r.user_id;
