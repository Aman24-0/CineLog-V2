// src/routes/api/admin/cron.ts
//
// CineLog V2 — Admin Cron Jobs API
// ---------------------------------------------------------------------
// Lists all pg_cron jobs scheduled by CineLog migrations and provides
// a "manual trigger" endpoint that invokes the underlying RPC function
// directly via the service-role client.
//
// Endpoints:
//   GET  /api/admin/cron                — list known pg_cron jobs
//   POST /api/admin/cron/trigger        — manually invoke a job's RPC
//        body: { job: "refresh_admin_analytics" | "cinelog_purge_soft_deleted_vault" | "weekly_recap" }
//
// STRICT USER-SIDE MAPPING:
//   Only the 3 pg_cron jobs actually created by supabase/migrations are
//   exposed here. The schedules are sourced verbatim from the migrations:
//     • refresh_admin_analytics         — '5 * * * *'  (hourly at :05)
//       migration: 20260723_admin_phase3.sql §1.5
//     • cinelog_purge_soft_deleted_vault — '0 2 * * *' (daily at 02:00 UTC)
//       migration: 20260804_schedule_purge_soft_deleted_vault_cron.sql
//     • weekly_recap                    — '0 9 * * *'  (daily at 09:00 UTC)
//       migration: 20260803_add_weekly_recap_preferences.sql §4
//
// NOTE on dynamic cron.job reads:
//   The `cron.job` catalog table lives in the `cron` schema, which is
//   NOT exposed via PostgREST by default. Querying it from the supabase-js
//   client would require a custom RPC. To keep this chunk self-contained
//   (no new migration), we surface the known jobs as a static list. The
//   schedules are immutable (set in the migrations) so this is safe.
//   "Last run" / "next run" timestamps come from maintenance_runs (for
//   purge_soft_deleted_vault) or are surfaced as "via pg_cron" otherwise.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

interface CronJob {
  /** pg_cron jobname (matches cron.job.jobname) */
  name: string;
  /** Cron expression as scheduled */
  schedule: string;
  /** Human-readable schedule description */
  schedule_description: string;
  /** The command pg_cron runs (matches cron.job.command) */
  command: string;
  /** Target RPC function name (for manual trigger) */
  rpc: string;
  /** Args to pass to the RPC (JSON object) */
  rpc_args: Record<string, unknown>;
  /** Where the job runs: 'db' = direct SQL function, 'http' = via pg_net */
  target_type: "db" | "http";
  /** HTTP endpoint if target_type === 'http' */
  http_endpoint?: string;
  /** Brief description of what the job does */
  description: string;
  /** Migration that scheduled this job */
  source_migration: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// The 3 known pg_cron jobs (see file header for migration sources).
const KNOWN_JOBS: CronJob[] = [
  {
    name: "refresh_admin_analytics",
    schedule: "5 * * * *",
    schedule_description: "Every hour at minute 5",
    command: "SELECT public.refresh_admin_analytics();",
    rpc: "refresh_admin_analytics",
    rpc_args: {},
    target_type: "db",
    description:
      "Refreshes all admin materialized views (user growth, active users, content engagement, top titles).",
    source_migration: "20260723_admin_phase3.sql"
  },
  {
    name: "cinelog_purge_soft_deleted_vault",
    schedule: "0 2 * * *",
    schedule_description: "Daily at 02:00 UTC",
    command: "SELECT public.purge_soft_deleted_vault(30);",
    rpc: "purge_soft_deleted_vault",
    rpc_args: { days: 30 },
    target_type: "db",
    description:
      "Permanently deletes vault items soft-deleted more than 30 days ago. Cascades to episode_progress + collection_entries.",
    source_migration: "20260804_schedule_purge_soft_deleted_vault_cron.sql"
  },
  {
    name: "weekly_recap",
    schedule: "0 9 * * *",
    schedule_description: "Daily at 09:00 UTC (filters by user's preferred day)",
    command: "SELECT net.http_post(...)", // simplified — see migration
    rpc: "",
    rpc_args: {},
    target_type: "http",
    http_endpoint: "/api/cron/weekly-recap",
    description:
      "Sends weekly recap emails + push notifications to users whose preferred day matches today. Invokes the Vercel endpoint via pg_net.",
    source_migration: "20260803_add_weekly_recap_preferences.sql"
  }
];

// ─── GET: list jobs ──────────────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const supabase = createAdminClient();

    // For each DB-targeted job, look up the most recent matching entry in
    // maintenance_runs so the UI can show a "last manual run" timestamp.
    // pg_cron-triggered runs are NOT in maintenance_runs (they don't go
    // through the admin API), so this is strictly the last admin-triggered
    // run. We surface this distinction in the UI.
    const lastRuns: Record<string, { finished_at: string | null; status: string | null }> = {};

    const { data: recentRuns } = await supabase
      .from("maintenance_runs")
      .select("operation, status, finished_at")
      .order("finished_at", { ascending: false })
      .limit(50);

    if (recentRuns) {
      // Map RPC name → maintenance_runs operation name
      const rpcToOp: Record<string, string> = {
        refresh_admin_analytics: "refresh_admin_analytics",
        purge_soft_deleted_vault: "purge_soft_deleted_vault"
      };
      for (const job of KNOWN_JOBS) {
        if (job.target_type !== "db") continue;
        const opName = rpcToOp[job.rpc];
        if (!opName) continue;
        const match = recentRuns.find((r) => r.operation === opName);
        if (match) {
          lastRuns[job.name] = {
            finished_at: match.finished_at,
            status: match.status
          };
        }
      }
    }

    return jsonResponse({
      jobs: KNOWN_JOBS,
      last_runs: lastRuns,
      note:
        "Schedules are sourced from supabase/migrations. pg_cron does not expose run history via PostgREST; 'Last manual run' reflects admin-triggered invocations only."
    });
  } catch (err) {
    console.error("[admin/cron] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── POST: manual trigger ────────────────────────────────────────
//
// Body: { job: "<jobname>" }
//
// For DB-targeted jobs, calls the underlying RPC via the service-role
// client. For HTTP-targeted jobs (weekly_recap), we don't trigger here
// — the operator should hit the endpoint directly with the cron secret.
// We return a 400 with guidance in that case.

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "cron.trigger"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      job?: string;
    };
    const jobName = body.job?.trim();
    if (!jobName) {
      return jsonResponse({ error: "Missing 'job' in request body" }, 400);
    }

    const job = KNOWN_JOBS.find((j) => j.name === jobName);
    if (!job) {
      return jsonResponse(
        { error: `Unknown job: ${jobName}. Known jobs: ${KNOWN_JOBS.map((j) => j.name).join(", ")}` },
        404
      );
    }

    if (job.target_type === "http") {
      return jsonResponse(
        {
          error:
            "HTTP-targeted jobs cannot be manually triggered from this endpoint. Invoke the target URL directly with the X-Cron-Secret header.",
          http_endpoint: job.http_endpoint
        },
        400
      );
    }

    const supabase = createAdminClient();

    // Invoke the RPC. The function is SECURITY DEFINER and granted to
    // service_role, so the admin client can call it.
    const { error: rpcError, data: rpcData } = await supabase.rpc(
      job.rpc as never,
      job.rpc_args
    );

    if (rpcError) {
      console.error(`[admin/cron] RPC ${job.rpc} failed:`, rpcError);
      await logAdminAction(event, adminResult.admin, {
        action: "cron.manual_trigger",
        entity_type: "cron_job",
        entity_id: job.name,
        payload: { rpc: job.rpc, args: job.rpc_args, error: rpcError.message }
      });
      return jsonResponse(
        { error: `RPC failed: ${rpcError.message}`, job: job.name },
        500
      );
    }

    await logAdminAction(event, adminResult.admin, {
      action: "cron.manual_trigger",
      entity_type: "cron_job",
      entity_id: job.name,
      payload: { rpc: job.rpc, args: job.rpc_args, result: rpcData ?? null }
    });

    return jsonResponse({
      ok: true,
      job: job.name,
      rpc: job.rpc,
      result: rpcData ?? null
    });
  } catch (err) {
    console.error("[admin/cron] POST error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
