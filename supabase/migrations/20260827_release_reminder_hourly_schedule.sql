-- Upgrade an existing release-reminder job to hourly cadence.
-- The initial scheduler migration is safe on a fresh database, while this
-- forward-only migration handles projects where that migration was already
-- applied before local-time delivery was finalized.
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'release_reminders'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_job_id, schedule := '0 * * * *');
  END IF;
END;
$$;
