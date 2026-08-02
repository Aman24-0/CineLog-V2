-- ============================================================
-- CineLog V2 — Phase 4 Task 24: purge_soft_deleted_vault
-- Date: 2026-08-04
--
-- Issue:
--   The trash page only purges expired vault items when the user
--   visits the Trash page. Items linger indefinitely if the user
--   never visits. There is no server-side cron to auto-purge.
--
-- Fix:
--   Add a SECURITY DEFINER function that hard-deletes vault rows
--   soft-deleted more than N days ago, AND cascades the delete to
--   the two related tables that reference vault.id:
--     • episode_progress (FK to vault.id)
--     • collection_entries (FK to vault.id)
--
--   This function is exposed in the admin Maintenance panel via
--   the existing /api/admin/maintenance API route. The admin can
--   trigger it on demand; a future pg_cron job can call it nightly.
--
-- Security:
--   • SECURITY DEFINER — runs as the function owner (postgres),
--     bypassing RLS. This is required to delete other users' rows.
--   • EXECUTE is granted ONLY to service_role (not authenticated /
--     anon / public), matching the Phase 0 security pattern. The
--     API route (/api/admin/maintenance) checks requireAdmin()
--     before calling the function via the service_role client.
--   • The function is idempotent — running it twice is a no-op the
--     second time (everything that matched the cutoff was already
--     deleted).
--
-- Returns:
--   JSONB summary: { operation, cutoff, rows_affected,
--                    breakdown: { vault, episode_progress,
--                                 collection_entries } }
-- ============================================================

-- ─── 1. Create the function ────────────────────────────────────
--
-- We use a CTE chain (WITH ... DELETE ... RETURNING) so all three
-- deletes happen in a single statement and Postgres can optimize
-- the cascade. The order matters:
--   1. Delete episode_progress rows whose vault_id is in the
--      soft-deleted set.
--   2. Delete collection_entries rows whose vault_id is in the
--      soft-deleted set.
--   3. Finally delete the vault rows themselves.
--
-- If we deleted vault first, the FK ON DELETE behavior (SET NULL
-- or CASCADE, depending on the constraint) would fire and we'd
-- lose track of which child rows belonged to the deleted vaults
-- for the breakdown report. By deleting children first, we control
-- the order and can count precisely.

CREATE OR REPLACE FUNCTION public.purge_soft_deleted_vault(days INT DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (days || ' days')::interval;
  vault_ids UUID[];
  vault_deleted BIGINT := 0;
  ep_deleted BIGINT := 0;
  ce_deleted BIGINT := 0;
BEGIN
  -- Collect the IDs we're about to purge. We snapshot them first so
  -- the breakdown counts are exact (a COUNT(*) before DELETE could
  -- race with concurrent inserts in theory, though soft-deleted
  -- rows don't get new children in practice).
  SELECT array_agg(id) INTO vault_ids
    FROM public.vault
    WHERE deleted_at IS NOT NULL
      AND deleted_at < cutoff;

  -- No work to do — return early with zeros.
  IF vault_ids IS NULL OR array_length(vault_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'operation', 'purge_soft_deleted_vault',
      'cutoff', cutoff,
      'rows_affected', 0,
      'breakdown', jsonb_build_object(
        'vault', 0,
        'episode_progress', 0,
        'collection_entries', 0
      ),
      'note', 'No vault items matched the cutoff.'
    );
  END IF;

  -- 1. Delete episode_progress rows tied to the soon-to-be-purged
  --    vault items. Using `= ANY(...)` instead of `IN (...)` to
  --    avoid the row-count limit on IN clauses for very large
  --    purge batches.
  DELETE FROM public.episode_progress
    WHERE vault_id = ANY(vault_ids);
  GET DIAGNOSTICS ep_deleted = ROW_COUNT;

  -- 2. Delete collection_entries rows tied to the same vault items.
  DELETE FROM public.collection_entries
    WHERE vault_id = ANY(vault_ids);
  GET DIAGNOSTICS ce_deleted = ROW_COUNT;

  -- 3. Finally, hard-delete the vault rows themselves.
  DELETE FROM public.vault
    WHERE id = ANY(vault_ids);
  GET DIAGNOSTICS vault_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'operation', 'purge_soft_deleted_vault',
    'cutoff', cutoff,
    'rows_affected', vault_deleted,
    'breakdown', jsonb_build_object(
      'vault', vault_deleted,
      'episode_progress', ep_deleted,
      'collection_entries', ce_deleted
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ─── 2. Grant EXECUTE only to service_role ────────────────────
--
-- Phase 0 security pattern: maintenance functions are callable
-- only via the server-side API route (which uses service_role
-- after requireAdmin() passes). Authenticated/anon/public have
-- no business calling purge functions directly — even if they
-- could pass the admin check inside the function, granting
-- EXECUTE would expand the attack surface (a vulnerability in
-- the admin check would let any signed-in user wipe vault data).
--
-- REVOKE is idempotent — running it twice is a no-op.
REVOKE EXECUTE ON FUNCTION public.purge_soft_deleted_vault(INT) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.purge_soft_deleted_vault(INT) TO service_role;

-- ─── 3. Summary ───────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Task 24 migration complete:';
  RAISE NOTICE '  • purge_soft_deleted_vault(days INT DEFAULT 30) created as SECURITY DEFINER';
  RAISE NOTICE '  • EXECUTE revoked from authenticated/anon/public';
  RAISE NOTICE '  • EXECUTE granted to service_role only';
  RAISE NOTICE '  • Cascades deletes to episode_progress + collection_entries';
  RAISE NOTICE 'Add to admin maintenance panel via /api/admin/maintenance OPERATIONS list.';
END;
$$;
