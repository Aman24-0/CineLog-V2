-- Claim release reminders from an authenticated client tab.

ALTER TABLE public.user_reminders
  ADD COLUMN IF NOT EXISTS notification_claimed_at TIMESTAMPTZ;

-- The base reminder migration intentionally only declared insert/delete
-- policies; this update policy also enables safe client metadata refreshes.

DROP POLICY IF EXISTS "user_reminders_update" ON public.user_reminders;
CREATE POLICY "user_reminders_update" ON public.user_reminders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- The server scheduler uses the service-role-only claim function from the
-- companion migration; this variant is restricted to auth.uid() so an app
-- tab can participate in the same short lease without exposing other users'
-- reminders.

CREATE OR REPLACE FUNCTION public.claim_due_user_reminder_for_user(
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
    AND user_id = auth.uid()
    AND is_scheduled = TRUE
    AND notification_sent = FALSE
    AND (
      notification_claimed_at IS NULL
      OR notification_claimed_at < NOW() - INTERVAL '15 minutes'
    )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_due_user_reminder_for_user(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_due_user_reminder_for_user(UUID)
  TO authenticated;
