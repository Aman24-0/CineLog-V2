// src/routes/api/admin/maintenance.ts
//
// CineLog V2 — Admin Maintenance API
// ---------------------------------------------------------------------
// Endpoints:
//   GET  /api/admin/maintenance           — list recent runs + ops info
//   POST /api/admin/maintenance           — run a maintenance operation
//   POST /api/admin/maintenance           — dry-run preview (body: { dry_run: true })
//   GET  /api/admin/maintenance/runs      — alias for run history (paginated)
//
// Operations exposed (each maps to a SQL function defined in the
// Phase 3 migration, plus purge_soft_deleted_vault from Phase 4):
//
//   purge_soft_deleted_profiles   — args: { days?: number = 90 }
//   purge_old_activity_log        — args: { days?: number = 180 }
//   purge_expired_tmdb_cache      — args: { days?: number = 30 }
//   purge_orphaned_collection_entries — no args
//   purge_soft_deleted_vault      — args: { days?: number = 30 }
//                                   (Phase 4 Task 24 — cascades to
//                                    episode_progress + collection_entries)
//   cleanup_old_admin_actions     — args: { days?: number = 365 }
//   refresh_admin_analytics       — no args
//   vacuum_analyze_hint           — no args (returns hint text)
//
// Each run is recorded in the maintenance_runs audit table:
//   { admin_id, operation, status, rows_affected, details, error,
//     started_at, finished_at }
//
// SECURITY: All operations require admin (requireAdmin). The functions
// themselves are SECURITY DEFINER so they bypass RLS — that's needed
// to clean up other users' rows. We log every invocation.

import {
  requireAdmin,
  type AdminAPIEvent,
  type AdminUser
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

type APIEvent = AdminAPIEvent;

type OperationName =
  | "purge_soft_deleted_profiles"
  | "purge_old_activity_log"
  | "purge_expired_tmdb_cache"
  | "purge_orphaned_collection_entries"
  | "purge_soft_deleted_vault"
  | "cleanup_old_admin_actions"
  | "refresh_admin_analytics"
  | "vacuum_analyze_hint";

interface OperationDef {
  name: OperationName;
  label: string;
  description: string;
  destructive: boolean;
  default_days?: number;
  min_days?: number;
}

const OPERATIONS: OperationDef[] = [
  {
    name: "purge_soft_deleted_profiles",
    label: "Purge soft-deleted profiles",
    description:
      "Permanently delete profiles (and cascade) that were soft-deleted more than N days ago. Does NOT remove the auth.users row — use the Supabase dashboard for that.",
    destructive: true,
    default_days: 90,
    min_days: 7
  },
  {
    name: "purge_old_activity_log",
    label: "Purge old activity log",
    description:
      "Delete activity_log rows older than N days. Activity log is high-volume; pruning keeps the table small.",
    destructive: true,
    default_days: 180,
    min_days: 30
  },
  {
    name: "purge_expired_tmdb_cache",
    label: "Purge expired TMDB cache",
    description:
      "Delete tmdb_cache rows older than N days. The cache will be re-populated on demand.",
    destructive: false,
    default_days: 30,
    min_days: 1
  },
  {
    name: "purge_orphaned_collection_entries",
    label: "Purge orphaned collection entries",
    description:
      "Delete collection_entries whose vault_id no longer exists. Defensive cleanup — should normally be a no-op.",
    destructive: true
  },
  {
    name: "purge_soft_deleted_vault",
    label: "Purge expired vault items",
    description:
      "Permanently remove vault items that have been in trash longer than N days. Also cascades to episode_progress and collection_entries tied to the purged vault rows. Does NOT remove the underlying TMDB metadata or other users' vault entries for the same title.",
    destructive: true,
    default_days: 30,
    min_days: 7
  },
  {
    name: "cleanup_old_admin_actions",
    label: "Cleanup old admin actions",
    description:
      "Delete admin_actions rows older than N days. The audit log is append-only; this is the only way to remove old entries.",
    destructive: true,
    default_days: 365,
    min_days: 90
  },
  {
    name: "refresh_admin_analytics",
    label: "Refresh analytics now",
    description:
      "Manually trigger a refresh of all admin materialized views. The pg_cron job runs this hourly at minute 5.",
    destructive: false
  },
  {
    name: "vacuum_analyze_hint",
    label: "VACUUM ANALYZE hint",
    description:
      "VACUUM cannot run inside a transaction. This returns instructions for running it via the Supabase SQL editor.",
    destructive: false
  }
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── GET /api/admin/maintenance ──────────────────────────────────
// Returns the list of available operations + the 20 most recent runs.

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();

    // Get the 20 most recent runs
    const { data: recentRuns, error } = await supabase
      .from("maintenance_runs")
      .select(
        `
        id,
        admin_id,
        operation,
        status,
        rows_affected,
        details,
        error,
        started_at,
        finished_at
      `
      )
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[admin/maintenance] list error:", error);
      return jsonResponse({ error: "Failed to fetch maintenance runs" }, 500);
    }

    return jsonResponse(
      {
        operations: OPERATIONS,
        recent_runs: recentRuns ?? []
      },
      200
    );
  } catch (err) {
    console.error("[admin/maintenance] error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── POST /api/admin/maintenance ─────────────────────────────────
// Run a maintenance operation.
//
// Body:
//   { operation: "purge_soft_deleted_profiles", args?: { days: 60 } }

interface RunBody {
  operation?: unknown;
  args?: unknown;
  dry_run?: unknown;
}

// ─── Dry-run count estimation ────────────────────────────────────
//
// Phase 9 Chunk 6 — the admin UI shows a "Dry Run" button next to each
// operation. When pressed, the client sends `{ dry_run: true }` in the
// POST body. Instead of executing the purge RPC, we run a read-only
// COUNT query against the same table with the same WHERE clause the
// SQL function would use. The count is an estimate (the actual purge
// may delete a slightly different number if rows are added/removed
// between the dry run and the real run), but it's close enough to
// give the admin confidence before they hit "Run" on a destructive op.
//
// For operations that don't delete rows (refresh_admin_analytics,
// vacuum_analyze_hint), the dry run returns -1 and the UI shows "N/A".

const DRY_RUN_TABLES: Partial<
  Record<
    OperationName,
    {
      table: string;
      // column to compare against the days-cutoff, or null for no-date ops
      dateColumn: string | null;
      // for soft-delete purges, only count rows where deleted_at IS NOT NULL
      softDelete?: boolean;
      // for orphan checks, a custom filter description (we can't easily
      // express "NOT IN subquery" via the supabase client, so we use
      // a left-join approximation: count entries whose vault_id is null
      // OR not found — this is an upper bound, not exact)
      orphanCheck?: boolean;
    }
  >
> = {
  purge_soft_deleted_profiles: {
    table: "profiles",
    dateColumn: "deleted_at",
    softDelete: true
  },
  purge_old_activity_log: {
    table: "activity_log",
    dateColumn: "created_at"
  },
  purge_expired_tmdb_cache: {
    table: "tmdb_cache",
    dateColumn: "expires_at"
  },
  purge_orphaned_collection_entries: {
    table: "collection_entries",
    dateColumn: null,
    orphanCheck: true
  },
  purge_soft_deleted_vault: {
    table: "vault",
    dateColumn: "deleted_at",
    softDelete: true
  },
  cleanup_old_admin_actions: {
    table: "admin_actions",
    dateColumn: "created_at"
  }
};

async function estimateDryRunCount(
  supabase: ReturnType<typeof createAdminClient>,
  opDef: OperationDef,
  days: number | undefined
): Promise<{ count: number; note?: string }> {
  const meta = DRY_RUN_TABLES[opDef.name];
  if (!meta) {
    // refresh_admin_analytics, vacuum_analyze_hint — no rows affected
    return { count: -1, note: "No rows affected (maintenance/op hint op)" };
  }

  // Compute the ISO cutoff timestamp for date-based purges.
  const cutoffIso =
    meta.dateColumn && days !== undefined
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : null;

  let query = supabase
    .from(meta.table)
    .select("*", { count: "exact", head: true });

  if (meta.softDelete && meta.dateColumn && cutoffIso) {
    // Soft-delete purge: count rows where deleted_at IS NOT NULL AND
    // deleted_at < cutoff. The supabase client doesn't support IS NOT
    // NULL directly in the fluent API, so we use .not(column, "is", null)
    // chained with .lt(column, cutoff).
    query = query.not(meta.dateColumn, "is", null).lt(meta.dateColumn, cutoffIso);
  } else if (meta.dateColumn && cutoffIso) {
    // Date-based purge (no soft-delete gate): count rows where
    // dateColumn < cutoff.
    query = query.lt(meta.dateColumn, cutoffIso);
  } else if (meta.dateColumn && !cutoffIso) {
    // Operations with a dateColumn but no days cutoff (shouldn't happen
    // for current ops, but handle gracefully).
    return { count: 0, note: "No cutoff specified" };
  }

  // For orphan checks, the supabase client can't easily express a
  // NOT IN subquery. We return -1 with a note so the UI shows
  // "estimate unavailable" rather than a misleading 0.
  if (meta.orphanCheck) {
    return {
      count: -1,
      note: "Orphan check — run the operation to see actual count"
    };
  }

  const { count, error } = await query;

  if (error) {
    return {
      count: -1,
      note: `Estimate unavailable: ${error.message}`
    };
  }

  return { count: count ?? 0 };
}

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const admin: AdminUser = adminResult.admin;

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    admin,
    "maintenance.run"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request.json().catch(() => ({}))) as RunBody;
    const opName = typeof body.operation === "string" ? body.operation : "";
    const args = (
      typeof body.args === "object" && body.args !== null ? body.args : {}
    ) as {
      days?: number;
    };

    const opDef = OPERATIONS.find((o) => o.name === opName);
    if (!opDef) {
      return jsonResponse({ error: `Unknown operation: ${opName}` }, 400);
    }

    // Validate args
    let days: number | undefined;
    if (opDef.default_days !== undefined) {
      days = opDef.default_days;
      if (typeof args.days === "number" && Number.isFinite(args.days)) {
        if (opDef.min_days !== undefined && args.days < opDef.min_days) {
          return jsonResponse(
            { error: `days must be at least ${opDef.min_days}` },
            400
          );
        }
        days = Math.floor(args.days);
      }
    }

    // ─── Dry-run branch ──────────────────────────────────────────
    //
    // When dry_run is true, estimate the number of rows that WOULD be
    // affected without actually deleting anything. No maintenance_runs
    // row is inserted, no RPC is called, and no audit log entry is
    // written — the operation is purely a read-only COUNT.
    const isDryRun = body.dry_run === true;
    if (isDryRun) {
      const supabase = createAdminClient();
      const estimation = await estimateDryRunCount(supabase, opDef, days);
      return jsonResponse({
        ok: true,
        dry_run: true,
        operation: opDef.name,
        args: { days },
        would_affect: estimation.count,
        note: estimation.note ?? null
      });
    }

    // ─── Insert a "running" row ────────────────────────────────
    const supabase = createAdminClient();
    const startedAt = new Date().toISOString();

    const { data: runRow, error: insertError } = await supabase
      .from("maintenance_runs")
      .insert({
        admin_id: admin.id,
        operation: opDef.name,
        status: "running",
        started_at: startedAt
      })
      .select("id")
      .single();

    if (insertError || !runRow) {
      console.error(
        "[admin/maintenance] failed to insert run row:",
        insertError
      );
      return jsonResponse({ error: "Failed to start maintenance run" }, 500);
    }

    const runId = runRow.id;

    // ─── Execute the operation via RPC ─────────────────────────
    let rowsAffected = 0;
    let details: Record<string, unknown> = {};
    let runError: string | null = null;
    let status: "success" | "failed" | "partial" = "success";

    try {
      // Build the RPC call. Each function takes either 0 or 1 arg (days).
      const rpcArgs: Record<string, unknown> = {};
      if (opDef.default_days !== undefined && days !== undefined) {
        rpcArgs.days = days;
      }

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        opDef.name,
        rpcArgs
      );

      if (rpcError) {
        runError = rpcError.message;
        status = "failed";
      } else if (rpcResult && typeof rpcResult === "object") {
        // The function returns jsonb_build_object(...) — parse it
        const result = rpcResult as Record<string, unknown>;
        rowsAffected =
          typeof result.rows_affected === "number" ? result.rows_affected : 0;
        details = result;
        if (typeof result.note === "string") {
          details.note = result.note;
        }
      }
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
      status = "failed";
    }

    // ─── Update the run row with results ───────────────────────
    const finishedAt = new Date().toISOString();
    await supabase
      .from("maintenance_runs")
      .update({
        status,
        rows_affected: rowsAffected,
        details,
        error: runError,
        finished_at: finishedAt
      })
      .eq("id", runId);

    // ─── Audit log ─────────────────────────────────────────────
    await logAdminAction(event, admin, {
      action: `maintenance.${opDef.name}`,
      entity_type: "maintenance_run",
      entity_id: runId,
      payload: {
        operation: opDef.name,
        args: { days },
        status,
        rows_affected: rowsAffected,
        duration_ms:
          new Date(finishedAt).getTime() - new Date(startedAt).getTime()
      }
    });

    if (status === "failed") {
      return jsonResponse(
        {
          ok: false,
          run_id: runId,
          operation: opDef.name,
          error: runError,
          rows_affected: rowsAffected
        },
        500
      );
    }

    return jsonResponse(
      {
        ok: true,
        run_id: runId,
        operation: opDef.name,
        status,
        rows_affected: rowsAffected,
        details,
        started_at: startedAt,
        finished_at: finishedAt
      },
      200
    );
  } catch (err) {
    console.error("[admin/maintenance] POST error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
