-- CineLog V2 — Notes Retention Policy
-- ---------------------------------------------------------------------
-- PII Retention Fix: The `vault.notes` column stores user-written
-- notes that may contain personal information (thoughts, journal
-- entries, etc.). This migration adds:
--
-- 1. A comment documenting the PII nature of the column
-- 2. A pg_cron job that purges notes older than 2 years for
--    soft-deleted items (items in trash)
-- 3. A comment on the `profiles` table documenting data retention
--
-- Run this in the Supabase SQL Editor to apply.

-- Document PII columns
COMMENT ON COLUMN vault.notes IS 
  'User-written notes. May contain PII (personal thoughts, journal entries). 
   Subject to retention policy: notes on soft-deleted items are purged after 2 years.
   See scripts/add_notes_retention_policy.sql';

COMMENT ON COLUMN profiles.bio IS
  'User-written bio. May contain PII. Subject to retention policy.';

-- Purge notes on soft-deleted vault items older than 2 years
-- This prevents indefinite storage of PII in trashed items.
-- Requires pg_cron extension (enabled by default in Supabase).
SELECT cron.schedule(
  'purge-old-trash-notes',
  '0 3 * * 0',  -- Weekly on Sunday at 3 AM UTC
  $$
    UPDATE vault
    SET notes = NULL
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '2 years'
      AND notes IS NOT NULL;
  $$
);

-- Add a comment documenting the retention policy
COMMENT ON TABLE vault IS
  'User watchlist vault. Soft-deleted items (deleted_at IS NOT NULL) have their 
   notes purged after 2 years by the purge-old-trash-notes cron job.';
