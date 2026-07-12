// src/features/sync/reset/resetLibraryService.ts
//
// resetLibraryService — the SINGLE public API for resetting a user's
// CineLog library. Deletes ALL user-owned data while keeping the
// account, profile, preferences, and achievements intact.
//
// STRATEGY: Best-effort delete with error classification.
//
//   The service attempts the DELETE directly — no pre-probe. If
//   Supabase returns a "table not found / relation does not exist"
//   error, the table is treated as optional and skipped. Only real
//   database errors (permission, constraint, network, invalid query)
//   stop the reset.
//
// CORE vs OPTIONAL tables:
//   - Core tables (vault, collections, collection_entries, user_presets)
//     MUST succeed. If a delete fails on a core table, the reset stops.
//   - Optional tables (episode_progress, activity_log, import_export_jobs,
//     user_universe_subscriptions) are skipped if they don't exist.
//     If they exist but the delete fails with a real error, the reset
//     still stops (a real error is a real error).
//
// DELETE ORDER (dependency-safe — children before parents):
//   1. episode_progress  (depends on vault — optional)
//   2. collection_entries (depends on collections + vault — core)
//   3. collections (core)
//   4. user_universe_subscriptions (optional)
//   5. user_presets (core)
//   6. activity_log (optional)
//   7. import_export_jobs (optional)
//   8. vault (core — deleted last)
//
// KEEP:
//   - profiles, user_preferences, auth.users
//   - curated_universes / curated_universe_entries (dev-managed)
//   - external_ids / tmdb_cache (TMDB metadata cache)
//
// SECURITY:
//   Every delete is scoped by user_id (or via a subquery for tables
//   without a direct user_id column). RLS also enforces this at the
//   database level.
//

import { getClient } from "~/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResetLibraryStep {
  label: string;
  index: number;
}

export type ResetTableStatus = "deleted" | "skipped" | "failed";

export interface ResetTableResult {
  table: string;
  status: ResetTableStatus;
  rowsDeleted?: number;
  reason?: string;
  /** Whether this table is core (must succeed) or optional (can be skipped). */
  core: boolean;
}

export interface ResetLibraryResult {
  success: boolean;
  error?: string;
  failedStep?: string;
  tableResults: ResetTableResult[];
  deletedTables: string[];
  skippedTables: string[];
  failedTables: string[];
  totalRowsRemoved: number;
}

export interface ResetLibraryCallbacks {
  onProgress?: (step: ResetLibraryStep, totalSteps: number) => void;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Supabase error codes / messages that indicate the table doesn't exist.
 * When a DELETE returns one of these, the table is treated as optional
 * and skipped — NOT a real error.
 *
 * Supabase/PostgREST error indicators for missing tables:
 *   - "Could not find the table" (PostgREST message)
 *   - "relation \"public.X\" does not exist" (PostgreSQL message)
 *   - "PGRST205" (PostgREST code: schemaCacheMiss / relation not found)
 *   - "42P01" (PostgreSQL SQLSTATE: undefined_table)
 *   - "400 Bad Request" (Supabase returns this for missing tables)
 */
const TABLE_NOT_FOUND_PATTERNS = [
  "could not find the table",
  "relation",
  "does not exist",
  "pgrst205",
  "42p01",
  "undefined_table",
  "bad request",
  "schema cache miss",
];

/**
 * Classify a Supabase error.
 *
 * Returns:
 *   - "table-not-found" → the table doesn't exist; skip it (optional only)
 *   - "real-error"      → a genuine database error; stop the reset
 */
function classifyError(error: { message?: string; code?: string; details?: unknown }): "table-not-found" | "real-error" {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";
  const haystack = `${msg} ${code} ${details}`;
  return TABLE_NOT_FOUND_PATTERNS.some((p) => haystack.includes(p))
    ? "table-not-found"
    : "real-error";
}

// ---------------------------------------------------------------------------
// Delete steps
// ---------------------------------------------------------------------------

interface DeleteStep {
  key: string;
  label: string;
  /** Core tables MUST succeed. Optional tables can be skipped if missing. */
  core: boolean;
  /** Run the delete. Returns rows deleted, or throws on error. */
  delete: (client: ReturnType<typeof getClient>, uid: string) => Promise<number>;
}

const RESET_STEPS: DeleteStep[] = [
  {
    key: "episode_progress",
    label: "Deleting watch progress…",
    core: false,
    delete: async (client, uid) => {
      // episode_progress has no direct user_id — scope via vault_id.
      const { data: vaultRows, error: fetchErr } = await client
        .from("vault")
        .select("id")
        .eq("user_id", uid);
      if (fetchErr) throw fetchErr;
      if (!vaultRows || vaultRows.length === 0) return 0;
      const vaultIds = vaultRows.map((r) => r.id);
      const { count, error } = await client
        .from("episode_progress")
        .delete({ count: "exact" })
        .in("vault_id", vaultIds);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "collection_entries",
    label: "Deleting collection entries…",
    core: true,
    delete: async (client, uid) => {
      const { data: collections, error: fetchErr } = await client
        .from("collections")
        .select("id")
        .eq("user_id", uid);
      if (fetchErr) throw fetchErr;
      if (!collections || collections.length === 0) return 0;
      const collectionIds = collections.map((c) => c.id);
      const { count, error } = await client
        .from("collection_entries")
        .delete({ count: "exact" })
        .in("collection_id", collectionIds);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "collections",
    label: "Deleting collections…",
    core: true,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("collections")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "user_universe_subscriptions",
    label: "Deleting universe subscriptions…",
    core: false,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("user_universe_subscriptions")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "user_presets",
    label: "Deleting presets…",
    core: true,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("user_presets")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "activity_log",
    label: "Deleting activity log…",
    core: false,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("activity_log")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "import_export_jobs",
    label: "Deleting import history…",
    core: false,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("import_export_jobs")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    key: "vault",
    label: "Deleting watchlist…",
    core: true,
    delete: async (client, uid) => {
      const { count, error } = await client
        .from("vault")
        .delete({ count: "exact" })
        .eq("user_id", uid);
      if (error) throw error;
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
 * Best-effort delete strategy:
 *   - Attempts DELETE directly (no pre-probe).
 *   - If Supabase returns a "table not found" error on an OPTIONAL
 *     table, the table is skipped and the reset continues.
 *   - If a delete fails on a CORE table, or fails with a real database
 *     error (permission, constraint, network), the reset STOPS.
 *
 * @returns Detailed result with per-table status + total rows removed.
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
      failedTables: [],
      totalRowsRemoved: 0,
    };
  }

  const client = getClient();
  const totalSteps = RESET_STEPS.length;
  const tableResults: ResetTableResult[] = [];
  const deletedTables: string[] = [];
  const skippedTables: string[] = [];
  const failedTables: string[] = [];
  let totalRowsRemoved = 0;

  for (let i = 0; i < RESET_STEPS.length; i++) {
    const step = RESET_STEPS[i];
    cb?.onProgress?.({ label: step.label, index: i }, totalSteps);

    try {
      const rowsDeleted = await step.delete(client, uid);
      tableResults.push({ table: step.key, status: "deleted", rowsDeleted, core: step.core });
      deletedTables.push(step.key);
      totalRowsRemoved += rowsDeleted;
    } catch (err) {
      // Extract the Supabase error object — it may be a PostgrestError
      // with .message/.code, or a plain Error.
      const supaErr = err as { message?: string; code?: string; details?: unknown };
      const errorMsg = supaErr.message ?? (err instanceof Error ? err.message : String(err));
      const errorClass = classifyError(supaErr);

      // Table-not-found on optional tables → skip, continue.
      if (errorClass === "table-not-found" && !step.core) {
        console.warn(`[resetUserLibrary] Optional table "${step.key}" not found — skipping.`);
        tableResults.push({
          table: step.key,
          status: "skipped",
          reason: "Table does not exist in the live schema",
          core: step.core,
        });
        skippedTables.push(step.key);
        continue;
      }

      // Any other error (real error on optional, OR any error on core) → stop.
      console.error(`[resetUserLibrary] Step "${step.key}" failed:`, errorMsg);
      tableResults.push({
        table: step.key,
        status: "failed",
        reason: errorMsg,
        core: step.core,
      });
      failedTables.push(step.key);

      return {
        success: false,
        error: `Couldn't reset your library. Step "${step.key}" failed: ${errorMsg}`,
        failedStep: step.key,
        tableResults,
        deletedTables,
        skippedTables,
        failedTables,
        totalRowsRemoved,
      };
    }
  }

  // Log the final report in development.
  logResetReport({ success: true, tableResults, deletedTables, skippedTables, failedTables, totalRowsRemoved });

  return {
    success: true,
    tableResults,
    deletedTables,
    skippedTables,
    failedTables,
    totalRowsRemoved,
  };
}

// ---------------------------------------------------------------------------
// Dev report logger
// ---------------------------------------------------------------------------

function logResetReport(result: ResetLibraryResult): void {
  if (typeof console === "undefined") return;
  const isDev = import.meta.env?.DEV ?? false;
  if (!isDev) return;

  console.group("%c[CineLog] Library Reset Report", "color: #6ee7b7; font-weight: bold;");
  console.log(`Success: ${result.success}`);
  console.log(`Total rows removed: ${result.totalRowsRemoved}`);
  console.log(`Deleted tables: ${result.deletedTables.join(", ") || "(none)"}`);
  console.log(`Skipped tables: ${result.skippedTables.join(", ") || "(none)"}`);
  console.log(`Failed tables: ${result.failedTables.join(", ") || "(none)"}`);
  console.table(result.tableResults);
  console.groupEnd();
}
