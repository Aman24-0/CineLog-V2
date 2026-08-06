// src/features/admin/AdminCronPage.tsx
//
// CineLog V2 — Admin Cron Jobs Page (Phase 9 Chunk 7)
// ---------------------------------------------------------------------
// Lists all pg_cron jobs scheduled by CineLog migrations and provides a
// "Manual Trigger" button that invokes the underlying RPC directly.
//
// FEATURES:
//   • Glass UI (GlassCard, GlassButton, GlassBadge, GlassModal)
//   • Per-job card: Name, Schedule (cron + human description), Command,
//     Target (DB RPC or HTTP endpoint), Last manual run, Status badge.
//   • "Manual Trigger" button with confirmation dialog (GlassModal).
//   • Per-job result panel showing the RPC return value or error.
//
// STRICT USER-SIDE MAPPING:
//   The 3 jobs surfaced here are the ONLY pg_cron jobs created by
//   supabase/migrations/*.sql. Schedules are immutable (set in
//   migrations). The API endpoint hardcodes the job list to avoid
//   requiring cron.job PostgREST exposure.
//
// MOBILE-FIRST:
//   Job meta grid: 1 col (mobile) → 2 (tablet) → 4 (desktop). Action
//   buttons wrap on phone. Result panel uses word-break to handle
//   long RPC output.

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassModal } from "~/shared/ui/glass/GlassModal";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";

// ─── Types (mirror API) ─────────────────────────────────────────

interface CronJob {
  name: string;
  schedule: string;
  schedule_description: string;
  command: string;
  rpc: string;
  rpc_args: Record<string, unknown>;
  target_type: "db" | "http";
  http_endpoint?: string;
  description: string;
  source_migration: string;
}

interface LastRun {
  finished_at: string | null;
  status: string | null;
}

interface CronListResponse {
  jobs: CronJob[];
  last_runs: Record<string, LastRun>;
  note: string;
}

interface TriggerResponse {
  ok?: boolean;
  job?: string;
  rpc?: string;
  result?: unknown;
  error?: string;
  http_endpoint?: string;
}

// Per-job trigger result. We keep a Map keyed by job name so each
// card can display its own result independently.
interface JobResult {
  success: boolean;
  message: string;
  result?: string;
  timestamp: string;
}

// ─── Component ──────────────────────────────────────────────────

const AdminCronPage: Component = () => {
  const [jobs, setJobs] = createSignal<CronJob[]>([]);
  const [lastRuns, setLastRuns] = createSignal<Record<string, LastRun>>({});
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [note, setNote] = createSignal<string>("");

  // Manual trigger state
  const [confirmJob, setConfirmJob] = createSignal<CronJob | null>(null);
  const [triggering, setTriggering] = createSignal<string | null>(null);
  const [results, setResults] = createSignal<Map<string, JobResult>>(
    new Map()
  );
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper to set a single job's result without mutating the Map in place.
  const setJobResult = (jobName: string, result: JobResult) => {
    const next = new Map(results());
    next.set(jobName, result);
    setResults(next);
  };

  // ─── Data fetcher ─────────────────────────────────────────────

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/cron", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as CronListResponse;
      setJobs(data.jobs);
      setLastRuns(data.last_runs);
      setNote(data.note);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchJobs);

  // ─── Manual trigger ───────────────────────────────────────────

  const triggerJob = async (job: CronJob) => {
    setTriggering(job.name);
    try {
      const resp = await fetch("/api/admin/cron/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: job.name }),
        credentials: "include"
      });
      const body = (await resp.json().catch(() => ({}))) as TriggerResponse;
      if (!resp.ok || body.error) {
        const errMsg = body.error || `HTTP ${resp.status}`;
        setJobResult(job.name, {
          success: false,
          message: errMsg,
          timestamp: new Date().toISOString()
        });
        showToast(`Failed: ${errMsg}`, "error");
      } else {
        const resultStr =
          body.result === null || body.result === undefined
            ? "(no output)"
            : typeof body.result === "object"
              ? JSON.stringify(body.result, null, 2)
              : String(body.result);
        setJobResult(job.name, {
          success: true,
          message: `RPC ${job.rpc} completed successfully.`,
          result: resultStr,
          timestamp: new Date().toISOString()
        });
        showToast(`Triggered ${job.name}`, "success");
      }
      // Refresh last-runs after a short delay so the new entry shows up
      setTimeout(fetchJobs, 800);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error";
      setJobResult(job.name, {
        success: false,
        message: errMsg,
        timestamp: new Date().toISOString()
      });
      showToast(errMsg, "error");
    } finally {
      setTriggering(null);
      setConfirmJob(null);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────

  const formatDate = (iso: string | null): string => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  };

  const statusBadge = (job: CronJob) => {
    if (job.target_type === "http") {
      return <GlassBadge label="HTTP" intent="info" size="compact" />;
    }
    return <GlassBadge label="Scheduled" intent="success" size="compact" />;
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div class="admin-devtools-shell">
      <header class="admin-devtools-header">
        <div>
          <h2>Cron Jobs</h2>
          <p>
            pg_cron jobs scheduled by CineLog migrations. Schedules are
            immutable and sourced from the migration files. Use "Manual
            Trigger" to invoke a job's underlying RPC immediately.
          </p>
        </div>
        <div class="admin-devtools-actions">
          <GlassButton
            variant="secondary"
            size="compact"
            icon="refresh"
            onClick={fetchJobs}
          >
            Refresh
          </GlassButton>
        </div>
      </header>

      <Show when={note()}>
        <div class="admin-devtools-alert info" role="note">
          {note()}
        </div>
      </Show>

      <Show when={error()}>
        <div class="admin-devtools-alert" role="alert">
          {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="flex flex-col gap-3">
          <For each={Array.from({ length: 3 })}>
            {() => <GlassSkeleton variant="card" height="180px" />}
          </For>
        </div>
      </Show>

      <Show when={!loading() && jobs().length === 0}>
        <GlassEmptyState
          icon="schedule"
          title="No cron jobs found"
          message="No pg_cron jobs are scheduled. Check supabase/migrations for cron.schedule calls."
          surface
        />
      </Show>

      <Show when={!loading() && jobs().length > 0}>
        <div class="admin-cron-list">
          <For each={jobs()}>
            {(job) => {
              // Per-row memos — these are fine inside For because For's
              // callback runs once per item in a reactive context.
              const lastRun = createMemo(() => lastRuns()[job.name]);
              const jobResult = createMemo(() => results().get(job.name));
              return (
                <GlassCard padding="default" class="admin-cron-card">
                  {/* Header */}
                  <div class="admin-cron-card-header">
                    <span
                      class="material-symbols-outlined text-primary"
                      style={{
                        "font-variation-settings":
                          "'FILL' 1, 'wght' 400, 'opsz' 24",
                        "font-size": "1.5rem"
                      }}
                      aria-hidden="true"
                    >
                      {job.target_type === "http" ? "send" : "schedule"}
                    </span>
                    <h4>{job.name}</h4>
                    {statusBadge(job)}
                  </div>

                  <p
                    class="admin-devtools-card-desc"
                    style={{ margin: 0 }}
                  >
                    {job.description}
                  </p>

                  {/* Meta grid */}
                  <div class="admin-cron-meta-grid">
                    <div class="admin-cron-meta-item">
                      <div class="admin-cron-meta-label">Schedule</div>
                      <div class="admin-cron-meta-value mono">
                        {job.schedule}
                      </div>
                      <div
                        style={{
                          "font-size": "0.7rem",
                          color: "var(--text-muted)",
                          "margin-top": "2px"
                        }}
                      >
                        {job.schedule_description}
                      </div>
                    </div>

                    <div class="admin-cron-meta-item">
                      <div class="admin-cron-meta-label">Target</div>
                      <div class="admin-cron-meta-value mono">
                        {job.target_type === "db"
                          ? job.rpc
                          : job.http_endpoint}
                      </div>
                      <div
                        style={{
                          "font-size": "0.7rem",
                          color: "var(--text-muted)",
                          "margin-top": "2px"
                        }}
                      >
                        {job.target_type === "db"
                          ? "Direct SQL function call"
                          : "HTTP POST via pg_net"}
                      </div>
                    </div>

                    <div class="admin-cron-meta-item">
                      <div class="admin-cron-meta-label">
                        Last Manual Run
                      </div>
                      <div class="admin-cron-meta-value">
                        {formatDate(lastRun()?.finished_at ?? null)}
                      </div>
                      <Show when={lastRun()?.status}>
                        <div
                          style={{
                            "font-size": "0.7rem",
                            "margin-top": "2px"
                          }}
                        >
                          <span
                            style={{
                              color:
                                lastRun()?.status === "success"
                                  ? "rgb(74, 222, 128)"
                                  : lastRun()?.status === "failed"
                                    ? "rgb(252, 165, 165)"
                                    : "var(--text-muted)"
                            }}
                          >
                            {lastRun()?.status}
                          </span>
                        </div>
                      </Show>
                    </div>

                    <div class="admin-cron-meta-item">
                      <div class="admin-cron-meta-label">Source</div>
                      <div
                        class="admin-cron-meta-value mono"
                        style={{ "font-size": "0.7rem" }}
                      >
                        {job.source_migration}
                      </div>
                    </div>
                  </div>

                  {/* Command */}
                  <div
                    style={{
                      background: "var(--glass-bg)",
                      border: "1px solid var(--hairline)",
                      "border-radius": "var(--radius-sm)",
                      padding: "var(--sp-2) var(--sp-3)",
                      "font-family": "'SF Mono', 'Fira Code', monospace",
                      "font-size": "0.7rem",
                      color: "var(--text-secondary)",
                      "word-break": "break-all",
                      "overflow-wrap": "anywhere"
                    }}
                  >
                    {job.command}
                  </div>

                  {/* Actions + result */}
                  <div class="admin-cron-actions">
                    <Show
                      when={job.target_type === "db"}
                      fallback={
                        <div
                          style={{
                            "font-size": "0.75rem",
                            color: "var(--text-muted)",
                            "font-style": "italic"
                          }}
                        >
                          HTTP-targeted jobs cannot be manually triggered
                          from this panel — invoke the endpoint directly with
                          the X-Cron-Secret header.
                        </div>
                      }
                    >
                      <GlassButton
                        variant="primary"
                        size="compact"
                        icon="play_arrow"
                        onClick={() => setConfirmJob(job)}
                        loading={triggering() === job.name}
                        disabled={triggering() !== null}
                      >
                        Manual Trigger
                      </GlassButton>
                    </Show>

                    <Show when={jobResult()}>
                      {(r) => (
                        <div
                          class="admin-cron-result"
                          classList={{
                            success: r().success,
                            error: !r().success
                          }}
                        >
                          <div style={{ "font-weight": "600" }}>
                            {r().success ? "✓ Success" : "✗ Failed"} —{" "}
                            {new Date(r().timestamp).toLocaleTimeString()}
                          </div>
                          <div style={{ "margin-top": "var(--sp-1)" }}>
                            {r().message}
                          </div>
                          <Show when={r().result}>
                            <pre
                              style={{
                                margin: "var(--sp-2) 0 0 0",
                                "font-family": "'SF Mono', monospace",
                                "font-size": "0.7rem",
                                "white-space": "pre-wrap",
                                "word-break": "break-word",
                                "overflow-wrap": "anywhere",
                                "max-height": "180px",
                                "overflow-y": "auto"
                              }}
                            >
                              {r().result}
                            </pre>
                          </Show>
                        </div>
                      )}
                    </Show>
                  </div>
                </GlassCard>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Confirmation modal */}
      <GlassModal
        open={confirmJob() !== null}
        onClose={() => setConfirmJob(null)}
        title="Confirm Manual Trigger"
        icon="warning"
        size="sm"
      >
        <Show when={confirmJob()}>
          {(job) => (
            <div class="flex flex-col gap-4">
              <p
                style={{
                  margin: 0,
                  "font-size": "0.875rem",
                  color: "var(--text)"
                }}
              >
                You are about to manually invoke the RPC{" "}
                <code
                  style={{
                    background: "var(--glass-bg)",
                    padding: "2px 6px",
                    "border-radius": "var(--radius-sm)",
                    "font-family": "'SF Mono', monospace",
                    "font-size": "0.75rem"
                  }}
                >
                  {job().rpc}
                </code>{" "}
                with args{" "}
                <code
                  style={{
                    background: "var(--glass-bg)",
                    padding: "2px 6px",
                    "border-radius": "var(--radius-sm)",
                    "font-family": "'SF Mono', monospace",
                    "font-size": "0.75rem"
                  }}
                >
                  {JSON.stringify(job().rpc_args)}
                </code>
                .
              </p>
              <p
                style={{
                  margin: 0,
                  "font-size": "0.8125rem",
                  color: "var(--text-muted)"
                }}
              >
                This will run the function immediately, bypassing the pg_cron
                schedule. The result will be recorded in the audit log.
              </p>
              <div class="flex gap-2 justify-end">
                <GlassButton
                  variant="glass"
                  size="compact"
                  onClick={() => setConfirmJob(null)}
                  disabled={triggering() !== null}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="compact"
                  icon="play_arrow"
                  onClick={() => triggerJob(job())}
                  loading={triggering() !== null}
                >
                  Trigger Now
                </GlassButton>
              </div>
            </div>
          )}
        </Show>
      </GlassModal>

      {/* Toast */}
      <Show when={toast()}>
        <div
          class="admin-devtools-toast"
          classList={{
            success: toast()?.type === "success",
            error: toast()?.type === "error"
          }}
        >
          {toast()?.msg}
        </div>
      </Show>
    </div>
  );
};

export default AdminCronPage;
