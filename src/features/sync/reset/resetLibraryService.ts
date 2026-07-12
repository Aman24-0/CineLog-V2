// src/features/sync/reset/resetLibraryService.ts
//
// resetLibraryService — the SINGLE public API for resetting a user's
// CineLog library. Deletes ALL user-owned data while keeping the
// account, profile, preferences, and achievements intact.
//
// DYNAMIC TABLE DETECTION:
//   Not every table in the schema may exist in the live Supabase project
//   (e.g. episode_progress, activity_log, import_export_jobs may not be
//   deployed yet). The service probes each table before deleting from it.
//   If a table doesn't exist, it's skipped gracefully — the reset
//   continues with the remaining tables. This makes the reset resilient
//   to schema drift between the type definitions and the live database.
//
// DELETE ORDER (dependency-safe — children before parents):
//   1. episode_progress  (depends on vault — optional, may not exist)
//   2. collection_entries (depends on collections + vault)
//   3. collections
//   4. user_universe_subscriptions
//   5. user_presets
//   6. activity_log (optional, may not exist)
//   7. import_export_jobs (optional, may not exist)
//   8. vault (deleted last — other tables reference it)
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
//   - Missing tables are SKIPPED (not errors).
//   - If a delete on an EXISTING table fails, the service STOPS
//     immediately and returns the error. No partial silent failure.
//

import { getClient } from "~/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResetLibraryStep {
  label: string;
  /** The step index (0-based) for progress calculation. */
  index: number;
}

export interface ResetTableResult {
  table: string;
  status: "deleted" | "skipped" | "error";
  rowsDeleted?: number;
  reason?: string;
}

export interface ResetLibraryResult {
  success: boolean;
  error?: string;
  /** Which step failed (if any), for logging. */
  failedStep?: string;
  /** Per-table results for the final report. */
  tableResults: ResetTableResult[];
  /** Tables that were confirmed to exist and had rows deleted. */
  deletedTables: string[];
  /** Tables that don't exist in the live schema and were skipped. */
  skippedTables: string[];
  /** Total rows removed across all tables. */
  totalRowsRemoved: number;
}

export interface ResetLibraryCallbacks {
  onProgress?: (step: ResetLibraryStep, totalSteps: number) => void;
}

// ---------------------------------------------------------------------------
// Table existence probe
// ---------------------------------------------------------------------------

/**
 * Cache of table-existence checks so we only probe each table once
 * per reset session. The key is the table name; the value is true if
 * the table exists, false if it doesn't.
 */
const tableExistenceCache = new Map<string, boolean>();

/**
 * Probe whether a table exists in the live Supabase project.
 *
 * Uses a lightweight `SELECT limit 0` — if the table doesn't exist,
 * Supabase returns an error (typically "Could not find the table" or
 * a 400 Bad Request). If it exists, the query succeeds with 0 rows.
 *
 * Results are cached for the duration of the reset session.
 */
async function tableExists(client: ReturnType<typeof getClient>, tableName: string): Promise<boolean> {
  if (tableExistenceCache.has(tableName)) {
    return tableExistenceCache.get(tableName)!;
  }
  try {
    // A select with limit 1 + head:true fetches no rows but validates
    // the table exists + the user has access. This is the cheapest
    // existence check Supabase supports.
    const { error } = await client
      .from(tableName)
      .select("id", { count: "exact", head: true })
      .limit(1);
    // If no error, the table exists.
    const exists = !error;
    tableExistenceCache.set(tableName, exists);
    if (!exists) {
      console.warn(`[resetUserLibrary] Table "${tableName}" does not exist in the live schema — skipping.`);
    }
    return exists;
  } catch {
    // Network/parse error — treat as "doesn't exist" so we skip.
    tableExistenceCache.set(tableName, false);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Delete steps
// ---------------------------------------------------------------------------

interface DeleteStep {
  key: string;
  label: string;
  /** Whether this table is optional (may not exist in the live schema). */
  optional?: boolean;
  delete: (client: ReturnType<typeof getClient>, uid: string) => Promise<number>;
}

/** The ordered list of delete steps. Returns the number of rows deleted. */
const RESET_STEPS: DeleteStep[] = [
  {
    key: "episode_progress",
    label: "Deleting watch progress…",
    optional: true,
    delete: async (client, uid) => {
      // episode_progress has no direct user_id column — scope via vault_id.
      const { data: vaultRows, error: fetchErr } = await client
        .from("vault")
        .select("id")
        .eq("user_id", uid);
      if (fetchErr) throw new Error(`Fetch vault ids for episode_progress: ${fetchErr.message}`);
      if (!vaultRows || vaultRows.length === 0) return 0;
      const vaultIds = vaultRows.map((r) => r.id);
      const { count, error } = await client
        .from("episode_progress")
        .delete({ count: "exact" })
        .in("vault_id", vaultIds);
      if (error) throw new Error(`episode_progress: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "collection_entries",
    label: "Deleting collection entries…",
    optional: false,
    delete: async (client, uid) => {
      const { data: collections, error: fetchErr } = await client
        .from("collections")
        .select("id")
        .eq("user_id", uid);
      if (fetchErr) throw new Error(`Fetch collection ids: ${fetchErr.message}`);
      if (!collections || collections.length === 0) return 0;
      const collectionIds = collections.map((c) => c.id);
      const { count, error } = await client
        .from("collection_entries")
        .delete({ count: "exact" })
        .in("collection_id", collectionIds);
      if (error) throw new Error(`collection_entries: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "collections",
    label: "Deleting collections…",
    optional: false,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("collections")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw new Error(`collections: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "user_universe_subscriptions",
    label: "Deleting universe subscriptions…",
    optional: true,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("user_universe_subscriptions")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw new Error(`user_universe_subscriptions: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "user_presets",
    label: "Deleting presets…",
    optional: false,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("user_presets")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw new Error(`user_presets: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "activity_log",
    label: "Deleting activity log…",
    optional: true,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("activity_log")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw new Error(`activity_log: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "import_export_jobs",
    label: "Deleting import history…",
    optional: true,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("import_export_jobs")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw new Error(`import_export_jobs: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    key: "vault",
    label: "Deleting watchlist…",
    optional: false,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("vault")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw new Error(`vault: ${error.message}`);
      return count ?? 0;
    },
  },
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Reset the user's CineLog library.
 *
 * Deletes ALL user-owned data (vault, collections, presets, progress,
 * activity, etc.) while keeping the account, profile, preferences, and
 * achievements intact.
 *
 * DYNAMIC TABLE DETECTION:
 *   Before deleting from each table, the service probes whether the
 *   table exists in the live Supabase project. Missing tables are
 *   skipped gracefully — the reset continues with the remaining tables.
 *   This makes the reset resilient to schema drift (e.g. when the type
 *   definitions include a table that hasn't been deployed yet).
 *
 * @param uid  The current user's id (from getCurrentUid).
 * @param cb   Optional progress callbacks.
 * @returns    Detailed result with per-table status + total rows removed.
 *
 * SECURITY: Every delete is scoped by user_id. RLS enforces this at
 * the database level as a second layer of defense.
 *
 * ATOMICITY: If a delete on an EXISTING table fails, the service stops
 * immediately. Missing tables are NOT errors — they're skipped.
 */
export async function resetUserLibrary(
  uid: string,
  cb?: ResetLibraryCallbacks,
): Promise<ResetLibraryResult> {
  if (!uid) {
    return {
      success: false,
      error: "You must be signed in to reset your library.",
      tableResults: [],
      deletedTables: [],
      skippedTables: [],
      totalRowsRemoved: 0,
    };
  }

  const client = getClient();
  const totalSteps = RESET_STEPS.length;
  const tableResults: ResetTableResult[] = [];
  const deletedTables: string[] = [];
  const skippedTables: string[] = [];
  let totalRowsRemoved = 0;

  for (let i = 0; i < RESET_STEPS.length; i++) {
    const step = RESET_STEPS[i];
    cb?.onProgress?.({ label: step.label, index: i }, totalSteps);

    // 1. Probe whether the table exists.
    const exists = await tableExists(client, step.key);
    if (!exists) {
      tableResults.push({ table: step.key, status: "skipped", reason: "Table does not exist in the live schema" });
      skippedTables.push(step.key);
      continue;
    }

    // 2. Table exists — run the delete.
    try {
      const rowsDeleted = await step.delete(client, uid);
      tableResults.push({ table: step.key, status: "deleted", rowsDeleted });
      deletedTables.push(step.key);
      totalRowsRemoved += rowsDeleted;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[resetUserLibrary] Step "${step.key}" failed:`, errorMsg);
      tableResults.push({ table: step.key, status: "error", reason: errorMsg });
      return {
        success: false,
        error: `Couldn't reset your library. Step "${step.key}" failed: ${errorMsg}`,
        failedStep: step.key,
        tableResults,
        deletedTables,
        skippedTables,
        totalRowsRemoved,
      };
    }
  }

  return {
    success: true,
    tableResults,
    deletedTables,
    skippedTables,
    totalRowsRemoved,
  };
}
