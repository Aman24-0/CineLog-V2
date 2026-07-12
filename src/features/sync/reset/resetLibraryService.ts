// src/features/sync/reset/resetLibraryService.ts
//
// resetLibraryService — the SINGLE public API for resetting a user's
// CineLog library. Deletes ALL user-owned data while keeping the
// account, profile, preferences, and achievements intact.
//
// DELETE ORDER (dependency-safe — children before parents):
//   1. episode_progress  (depends on vault)
//   2. collection_entries (depends on collections + vault)
//   3. collections
//   4. user_universe_subscriptions
//   5. user_presets
//   6. activity_log
//   7. import_export_jobs
//   8. vault              (deleted last — other tables reference it)
//
// KEEP:
//   - profiles (id = uid)
//   - user_preferences (user_id = uid)
//   - auth.users (Supabase Auth — not accessible from the client)
//   - curated_universes / curated_universe_entries (dev-managed)
//   - external_ids / tmdb_cache (TMDB metadata cache)
//
// SECURITY:
//   Every delete is scoped by user_id (or via a subquery for tables
//   without a direct user_id column). RLS also enforces this at the
//   database level, but we include explicit .eq("user_id", uid) for
//   defense-in-depth.
//
// ERROR HANDLING:
//   If any delete fails, the service STOPS immediately and returns
//   the error. No partial silent failure. The caller shows the error
//   toast and the user can retry.
//
// PROGRESS:
//   The onProgress callback fires before each step so the UI can show
//   "Deleting collection entries...", "Deleting collections...", etc.
//

import { getClient } from "~/lib/supabase/client";

export interface ResetLibraryStep {
  label: string;
  /** The step index (0-based) for progress calculation. */
  index: number;
}

export interface ResetLibraryResult {
  success: boolean;
  error?: string;
  /** Which step failed (if any), for logging. */
  failedStep?: string;
}

export interface ResetLibraryCallbacks {
  onProgress?: (step: ResetLibraryStep, totalSteps: number) => void;
}

/** The ordered list of delete steps. Each step has a user-facing label. */
const RESET_STEPS: Array<{ key: string; label: string; delete: (client: ReturnType<typeof getClient>, uid: string) => Promise<void> }> = [
  {
    key: "episode_progress",
    label: "Deleting watch progress…",
    delete: async (client, uid) => {
      // episode_progress has no direct user_id column — scope via vault_id.
      // First fetch the user's vault IDs, then delete progress for those IDs.
      const { data: vaultRows, error: fetchErr } = await client
        .from("vault")
        .select("id")
        .eq("user_id", uid);
      if (fetchErr) throw new Error(`Fetch vault ids for episode_progress: ${fetchErr.message}`);
      if (vaultRows && vaultRows.length > 0) {
        const vaultIds = vaultRows.map((r) => r.id);
        const { error } = await client
          .from("episode_progress")
          .delete()
          .in("vault_id", vaultIds);
        if (error) throw new Error(`episode_progress: ${error.message}`);
      }
    },
  },
  {
    key: "collection_entries",
    label: "Deleting collection entries…",
    delete: async (client, uid) => {
      // collection_entries has no user_id column — scope via collection_id.
      const { data: collections, error: fetchErr } = await client
        .from("collections")
        .select("id")
        .eq("user_id", uid);
      if (fetchErr) throw new Error(`Fetch collection ids: ${fetchErr.message}`);
      if (collections && collections.length > 0) {
        const collectionIds = collections.map((c) => c.id);
        const { error } = await client
          .from("collection_entries")
          .delete()
          .in("collection_id", collectionIds);
        if (error) throw new Error(`collection_entries: ${error.message}`);
      }
    },
  },
  {
    key: "collections",
    label: "Deleting collections…",
    delete: async (client, uid) => {
      const { error } = await client
        .from("collections")
        .delete()
        .eq("user_id", uid);
      if (error) throw new Error(`collections: ${error.message}`);
    },
  },
  {
    key: "user_universe_subscriptions",
    label: "Deleting universe subscriptions…",
    delete: async (client, uid) => {
      const { error } = await client
        .from("user_universe_subscriptions")
        .delete()
        .eq("user_id", uid);
      if (error) throw new Error(`user_universe_subscriptions: ${error.message}`);
    },
  },
  {
    key: "user_presets",
    label: "Deleting presets…",
    delete: async (client, uid) => {
      const { error } = await client
        .from("user_presets")
        .delete()
        .eq("user_id", uid);
      if (error) throw new Error(`user_presets: ${error.message}`);
    },
  },
  {
    key: "activity_log",
    label: "Deleting activity log…",
    delete: async (client, uid) => {
      const { error } = await client
        .from("activity_log")
        .delete()
        .eq("user_id", uid);
      if (error) throw new Error(`activity_log: ${error.message}`);
    },
  },
  {
    key: "import_export_jobs",
    label: "Deleting import history…",
    delete: async (client, uid) => {
      const { error } = await client
        .from("import_export_jobs")
        .delete()
        .eq("user_id", uid);
      if (error) throw new Error(`import_export_jobs: ${error.message}`);
    },
  },
  {
    key: "vault",
    label: "Deleting watchlist…",
    delete: async (client, uid) => {
      const { error } = await client
        .from("vault")
        .delete()
        .eq("user_id", uid);
      if (error) throw new Error(`vault: ${error.message}`);
    },
  },
];

/**
 * Reset the user's CineLog library.
 *
 * Deletes ALL user-owned data (vault, collections, presets, progress,
 * activity, etc.) while keeping the account, profile, preferences, and
 * achievements intact.
 *
 * @param uid  The current user's id (from getCurrentUid).
 * @param cb   Optional progress callbacks.
 * @returns    { success: true } on success, or { success: false, error } on failure.
 *
 * SECURITY: Every delete is scoped by user_id. RLS enforces this at
 * the database level as a second layer of defense.
 *
 * ATOMICITY: If any step fails, the service stops immediately. The
 * caller shows an error toast. The user can retry — already-deleted
 * rows are simply skipped on the retry (idempotent deletes).
 */
export async function resetUserLibrary(
  uid: string,
  cb?: ResetLibraryCallbacks,
): Promise<ResetLibraryResult> {
  if (!uid) {
    return { success: false, error: "You must be signed in to reset your library." };
  }

  const client = getClient();
  const totalSteps = RESET_STEPS.length;

  for (let i = 0; i < RESET_STEPS.length; i++) {
    const step = RESET_STEPS[i];
    try {
      cb?.onProgress?.({ label: step.label, index: i }, totalSteps);
      await step.delete(client, uid);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[resetUserLibrary] Step "${step.key}" failed:`, errorMsg);
      return {
        success: false,
        error: `Couldn't reset your library. Step "${step.key}" failed: ${errorMsg}`,
        failedStep: step.key,
      };
    }
  }

  return { success: true };
}
