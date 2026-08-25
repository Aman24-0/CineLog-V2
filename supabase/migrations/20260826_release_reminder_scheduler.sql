-- ---------------------------------------------------------------------
-- Server-side release reminder scheduler
-- ---------------------------------------------------------------------
-- Adds a short claim lease so overlapping cron invocations do not send the
-- same reminder concurrently. The lease is recoverable after 15 minutes if
-- a function instance dies before marking delivery complete.
--
-- The scheduler function takes the production URL and CRON_SECRET as
-- arguments so no credential is committed to the repository. It runs hourly
-- so the endpoint can evaluate each user's local calendar date. It is callable
-- only by service_role. The operator may invoke it after deployment, or the
-- optional current_setting block below will activate it when both settings
-- are already configured.

ALTER TABLE public.user_reminders
  ADD COLUMN IF NOT EXISTS notification_claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_reminders_release_delivery_idx
  ON public.user_reminders (release_date, notification_sent, is_scheduled)
  WHERE notification_sent = FALSE AND is_scheduled = TRUE;

CREATE OR REPLACE FUNCTION public.claim_due_user_reminder(
  p_reminder_id UUID
)
RETURNS SETOF public.user_reminders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_reminders
  SET notification_claimed_at = NOW()
  WHERE id = p_reminder_id
    AND is_scheduled = TRUE
    AND notification_sent = FALSE
    AND (
      notification_claimed_at IS NULL
      OR notification_claimed_at < NOW() - INTERVAL '15 minutes'
    )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_due_user_reminder(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_user_reminder(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_release_reminders(
  p_app_url TEXT,
  p_cron_secret TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_job_id BIGINT;
  v_endpoint TEXT;
  v_headers JSONB;
  v_command TEXT;
BEGIN
  IF p_app_url IS NULL OR p_app_url !~ '^https://[^/]+/?$' THEN
    RAISE EXCEPTION 'p_app_url must be a single HTTPS origin';
  END IF;
  IF p_cron_secret IS NULL OR char_length(p_cron_secret) < 16 THEN
    RAISE EXCEPTION 'p_cron_secret must be at least 16 characters';
  END IF;

  v_endpoint := rtrim(p_app_url, '/') || '/api/cron/release-reminders';
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_cron_secret
  );
  v_command := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb);',
    v_endpoint,
    v_headers::TEXT
  );

  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'release_reminders'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  RETURN cron.schedule(
    'release_reminders',
    '0 * * * *',
    v_command
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_release_reminders(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_release_reminders(TEXT, TEXT)
  TO service_role;

-- Safe automatic activation when an operator has configured the values as
-- database settings. In the current project these settings are unset, so the
-- block only installs the schema/functions and does not create a job.
DO $$
DECLARE
  v_app_url TEXT := current_setting('app.app_url', TRUE);
  v_cron_secret TEXT := current_setting('app.cron_secret', TRUE);
BEGIN
  IF v_app_url IS NOT NULL AND v_cron_secret IS NOT NULL THEN
    PERFORM public.schedule_release_reminders(v_app_url, v_cron_secret);
  ELSE
    RAISE NOTICE 'release_reminders not scheduled: configure app.app_url and app.cron_secret or call public.schedule_release_reminders(...) as service_role';
  END IF;
END;
$$;
