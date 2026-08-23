-- CineLog V2 — Episode reactions
-- Date: 2026-08-23
--
-- Adds the reaction half of the episode RATE workflow. Reactions live on
-- the same vault-scoped episode_progress row as the existing numeric rating,
-- so one episode keeps one coherent piece of user feedback. The migration is
-- additive, preserves all watch/progress columns, and inherits the table's
-- existing RLS policies.

ALTER TABLE public.episode_progress
  ADD COLUMN IF NOT EXISTS reaction TEXT DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'episode_progress_rating_range_check'
      AND conrelid = 'public.episode_progress'::regclass
  ) THEN
    ALTER TABLE public.episode_progress
      ADD CONSTRAINT episode_progress_rating_range_check
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'episode_progress_reaction_check'
      AND conrelid = 'public.episode_progress'::regclass
  ) THEN
    ALTER TABLE public.episode_progress
      ADD CONSTRAINT episode_progress_reaction_check
      CHECK (
        reaction IS NULL
        OR reaction IN ('love', 'funny', 'wow', 'sad', 'angry', 'disappointed')
      );
  END IF;
END;
$$;
