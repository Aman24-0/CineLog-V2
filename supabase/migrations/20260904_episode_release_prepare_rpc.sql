-- 20260904_episode_release_prepare_rpc.sql
--
-- Adds prepare_episode_release() RPC to safely transition episode_release_log
-- rows into the 'pending' state WITHOUT resetting another worker's active claim.
--
-- This fixes a race condition in processRelease() where the previous upsert
-- would blindly set claimed_at=NULL for existing rows, defeating the atomic
-- claim guarantee of claim_episode_release().
--
-- THE BUG (before this migration):
--   Worker A: upsert E2 pending (claimed_at=NULL) → claim E2 (claimed_at=now())
--             → starts sending push
--   Worker B concurrently: upsert E2 pending (claimed_at=NULL again!)
--             → RESETS Worker A's claim → claims E2 → sends another push
--   Result: TWO pushes for the same episode.
--
-- THE FIX:
--   Replace the blind upsert with a conditional prepare_episode_release() RPC
--   that NEVER touches an existing 'pending' row (preserving its claimed_at),
--   NEVER touches 'sent' or 'skipped' rows, and only transitions 'failed' →
--   'pending' (for the notified episode) or 'pending'/'failed' → 'skipped'
--   (for anti-spam episodes, only if no active claim).
--
-- STATE TRANSITION RULES (for an existing row):
--   sent                              → NEVER touched
--   skipped                           → NEVER touched
--   pending + active claim (<15min)   → NEVER touched (claim preserved)
--   pending + stale claim (>15min)    → may be reclaimed by claim_episode_release()
--   failed                            → may transition to pending (claimable)
--                                       [for notified episode path only]
--   failed                            → may transition to skipped
--                                       [for anti-spam path, only if no active claim]
--   new row                           → inserted as pending [notified] or skipped [anti-spam]
--
-- The function is idempotent and safe to call concurrently from multiple workers.

CREATE OR REPLACE FUNCTION public.prepare_episode_release(
  p_user_id uuid,
  p_tmdb_id bigint,
  p_season_number integer,
  p_episode_number integer,
  p_air_date date,
  p_title_name text,
  p_should_notify boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $prep_fn$
BEGIN
  -- Step 1: INSERT if not exists. New rows start in the appropriate state.
  -- ON CONFLICT DO NOTHING ensures we never overwrite an existing row here.
  IF p_should_notify THEN
    INSERT INTO public.episode_release_log (
      user_id, tmdb_id, season_number, episode_number,
      episode_air_date, title_name, notification_status, claimed_at
    )
    VALUES (
      p_user_id, p_tmdb_id, p_season_number, p_episode_number,
      p_air_date, p_title_name, 'pending', NULL
    )
    ON CONFLICT (user_id, tmdb_id, season_number, episode_number) DO NOTHING;
  ELSE
    -- Anti-spam episode: insert directly as 'skipped'.
    INSERT INTO public.episode_release_log (
      user_id, tmdb_id, season_number, episode_number,
      episode_air_date, title_name, notification_status, claimed_at, notified_at
    )
    VALUES (
      p_user_id, p_tmdb_id, p_season_number, p_episode_number,
      NULL, p_title_name, 'skipped', NULL, now()
    )
    ON CONFLICT (user_id, tmdb_id, season_number, episode_number) DO NOTHING;
  END IF;

  -- Step 2: Conditional UPDATE for existing rows.
  -- These UPDATEs are the critical safety mechanism. They ONLY touch rows
  -- in specific states, never touching 'sent', 'skipped', or actively-claimed
  -- 'pending' rows.
  IF p_should_notify THEN
    -- For the notified episode: only transition 'failed' → 'pending' (claimable).
    -- Do NOT touch 'pending' (preserves active claim), 'sent', or 'skipped' rows.
    -- This is the key fix: a 'pending' row with an active claim is NEVER reset.
    UPDATE public.episode_release_log
    SET notification_status = 'pending',
        claimed_at = NULL,
        notified_at = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND tmdb_id = p_tmdb_id
      AND season_number = p_season_number
      AND episode_number = p_episode_number
      AND notification_status = 'failed';
  ELSE
    -- For anti-spam episodes: transition 'pending' (no active claim) or 'failed'
    -- → 'skipped'. Do NOT touch 'sent', 'skipped', or actively-claimed 'pending'
    -- rows. This prevents an anti-spam worker from clobbering another worker's
    -- active claim on the same episode.
    UPDATE public.episode_release_log
    SET notification_status = 'skipped',
        notified_at = now(),
        claimed_at = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND tmdb_id = p_tmdb_id
      AND season_number = p_season_number
      AND episode_number = p_episode_number
      AND notification_status IN ('pending', 'failed')
      AND (claimed_at IS NULL OR claimed_at < now() - interval '15 minutes');
  END IF;
END;
$prep_fn$;

REVOKE ALL ON FUNCTION public.prepare_episode_release(uuid, bigint, integer, integer, date, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_episode_release(uuid, bigint, integer, integer, date, text, boolean)
  TO service_role;
