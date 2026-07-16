-- supabase/migrations/05_fix_external_ids_rls.sql
--
-- PRIVACY FIX: external_ids table had an overly-permissive SELECT policy
-- that allowed ANY authenticated user to read ALL external IDs for ALL
-- users' vault items.
--
-- BEFORE (insecure):
--   CREATE POLICY "external_ids_select_authenticated"
--   ON public.external_ids FOR SELECT
--   TO authenticated USING (true);
--
-- This meant any signed-in user could run:
--   SELECT * FROM external_ids;
-- and retrieve every external_id (IMDb, Trakt, etc.) linked to every
-- other user's vault items — leaking viewing-habits metadata.
--
-- The table is currently empty (0 rows at audit time), so no data was
-- actually leaked. But the policy is a latent privacy vulnerability
-- that must be fixed before the table is populated.
--
-- AFTER (secure):
--   The new policy uses an EXISTS subquery to check that the
--   external_ids.vault_id references a vault row owned by the
--   authenticated user — the same pattern used by episode_progress
--   and collection_entries.
--
-- This ensures a user can only SELECT external_ids for vault items
-- they own. RLS on the vault table (vault_select_own) is the primary
-- access control; this policy adds the join-through-vault check so
-- external_ids inherits vault ownership.
--
-- Privacy impact: HIGH — fixes a cross-user data access vulnerability.
-- Behavior impact: NONE — the table is empty and not yet used by the
-- application. This is a preventive fix before the table is populated.

BEGIN;

-- Drop the insecure policy (qual: true → any authenticated user can read all rows)
DROP POLICY IF EXISTS external_ids_select_authenticated ON public.external_ids;

-- Create a secure policy that inherits ownership from the vault table.
-- A user can only SELECT external_ids for vault items they own.
CREATE POLICY external_ids_select_own
  ON public.external_ids
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vault v
      WHERE v.id = external_ids.vault_id
        AND v.user_id = auth.uid()
    )
  );

-- Also add INSERT/UPDATE/DELETE policies with the same ownership check,
-- so when the table is eventually populated (by import or sync), only
-- the vault owner can modify their own external_ids.

CREATE POLICY external_ids_insert_own
  ON public.external_ids
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vault v
      WHERE v.id = external_ids.vault_id
        AND v.user_id = auth.uid()
    )
  );

CREATE POLICY external_ids_update_own
  ON public.external_ids
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vault v
      WHERE v.id = external_ids.vault_id
        AND v.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vault v
      WHERE v.id = external_ids.vault_id
        AND v.user_id = auth.uid()
    )
  );

CREATE POLICY external_ids_delete_own
  ON public.external_ids
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vault v
      WHERE v.id = external_ids.vault_id
        AND v.user_id = auth.uid()
    )
  );

COMMIT;
