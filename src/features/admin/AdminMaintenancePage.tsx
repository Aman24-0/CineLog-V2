// src/features/admin/AdminMaintenancePage.tsx
//
// CineLog V2 — Admin Maintenance Page (Phase 9 Chunk 6 rewrite)
// ---------------------------------------------------------------------
// Glass UI rewrite of the maintenance operations page.
//
// ZERO-DUPLICATION: The maintenance_window setting (enabled,
// scheduled_at, ends_at, message) is owned by THIS page now. It was
// removed from AdminSettingsPage in this chunk to avoid two pages
// editing the same key. The backing API is the same
// (/api/admin/settings → maintenance_window key), so existing DB
// values are preserved.
//
// USER-SIDE MAPPING: The maintenance banner is rendered by the
// MaintenanceBanner component on every authenticated page when
// `maintenance_window.enabled` is true and the current time is
// within [scheduled_at, ends_at]. The scheduled_at/ends_at fields
// are ISO timestamps stored in app_config.
//
// DRY RUN: Each operation card has a "Dry Run" button that sends
// `{ dry_run: true }` to the POST endpoint. The backend runs a
// read-only COUNT query (no DELETE, no maintenance_runs row, no
// audit log entry) and returns the estimated number of rows that
// would be affected. This gives the admin confidence before hitting
// "Run" on a destructive op.
//
// SCHEDULING: The maintenance window card exposes datetime-local
// inputs for start (scheduled_at) and end (ends_at), plus the
// banner message. Saves go through PUT /api/admin/settings with
// { settings: { maintenance_window: {...} } }.
//
// MOBILE-FIRST: Operations grid is single-column on phone, auto-fill
// on tablet+. Recent-runs table scrolls horizontally on narrow
// screens.

import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";

// ─── Types ─────────────────────────────────────────────────────────

interface OperationDef {
  name: string;
  label: string;
  description: string;
  destructive: boolean;
  default_days?: number;
  min_days?: number;
}

interface MaintenanceRun {
  id: string;
  admin_id: string | null;
  operation: string;
  status: "running" | "success" | "failed" | "partial";
  rows_affected: number;
  details: Record<string, unknown>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ListResponse {
  operations: OperationDef[];
  recent_runs: MaintenanceRun[];
}

interface DryRunResponse {
  ok: boolean;
  dry_run: boolean;
  operation: string;
  args: { days?: number };
  would_affect: number;
  note: string | null;
}

interface RunResponse {
  ok: boolean;
  run_id?: string;
  operation?: string;
  status?: string;
  rows_affected?: number;
  details?: Record<string, unknown>;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

interface MaintenanceWindow {
  enabled: boolean;
  scheduled_at: string | null;
  ends_at: string | null;
  message: string;
}

interface SettingsResponse {
  settings: {
    maintenance_window: { value: MaintenanceWindow; updated_at: string | null };
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Convert an ISO timestamp to a value usable in <input type="datetime-local">. */
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // Adjust for timezone offset so the local-time string is correct
    const tzOffset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function datetimeLocalToIso(local: string): string | null {
  if (!local) return null;
  try {
    return new Date(local).toISOString();
  } catch {
    return null;
  }
}

// ─── Component ─────────────────────────────────────────────────────

const AdminMaintenancePage: Component = () => {
  const [operations, setOperations] = createSignal<OperationDef[]>([]);
  const [runs, setRuns] = createSignal<MaintenanceRun[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [confirming, setConfirming] = createSignal<string | null>(null);
  const toast = signalToast();

  // Per-operation state
  const [opState, setOpState] = createSignal<
    Record<
      string,
      {
        running: boolean;
        dryRunning: boolean;
        days: number;
        lastResult: RunResponse | null;
        dryRunResult: DryRunResponse | null;
      }
    >
  >({});

  // Maintenance window state (named maintWindow to avoid shadowing
  // the global `window` object — we use window.location.href below).
  const [maintWindow, setMaintWindow] = createSignal<MaintenanceWindow>({
    enabled: false,
    scheduled_at: null,
    ends_at: null,
    message: ""
  });
  const [origWindow, setOrigWindow] = createSignal<string>("");
  const [windowSaving, setWindowSaving] = createSignal(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [maintResp, settingsResp] = await Promise.all([
        fetch("/api/admin/maintenance", { credentials: "include" }),
        fetch("/api/admin/settings", { credentials: "include" })
      ]);

      if (!maintResp.ok) {
        if (maintResp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${maintResp.status}`);
      }
      const data = (await maintResp.json()) as ListResponse;
      setOperations(data.operations);
      setRuns(data.recent_runs);

      const init: Record<
        string,
        {
          running: boolean;
          dryRunning: boolean;
          days: number;
          lastResult: RunResponse | null;
          dryRunResult: DryRunResponse | null;
        }
      > = {};
      for (const op of data.operations) {
        init[op.name] = {
          running: false,
          dryRunning: false,
          days: op.default_days ?? 0,
          lastResult: null,
          dryRunResult: null
        };
      }
      setOpState(init);

      // Load maintenance window settings
      if (settingsResp.ok) {
        const settingsData =
          (await settingsResp.json()) as SettingsResponse;
        const mw = settingsData.settings.maintenance_window.value;
        setMaintWindow(mw);
        setOrigWindow(JSON.stringify(mw));
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchAll);

  const isWindowDirty = createMemo(
    () => JSON.stringify(maintWindow()) !== origWindow()
  );

  // ─── Maintenance window save ────────────────────────────────

  const saveWindow = async () => {
    setWindowSaving(true);
    try {
      const resp = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { maintenance_window: maintWindow() }
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        toast.show(body.error || "Failed to save", "error");
      } else {
        setOrigWindow(JSON.stringify(maintWindow()));
        toast.show("Maintenance window saved", "success");
      }
    } catch {
      toast.show("Network error", "error");
    } finally {
      setWindowSaving(false);
    }
  };

  // ─── Dry run ────────────────────────────────────────────────

  const dryRun = async (op: OperationDef) => {
    const state = opState()[op.name];
    if (!state || state.dryRunning) return;

    setOpState({
      ...opState(),
      [op.name]: { ...state, dryRunning: true, dryRunResult: null }
    });

    try {
      const args: { days?: number } = {};
      if (op.default_days !== undefined) args.days = state.days;
      const resp = await fetch("/api/admin/maintenance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: op.name, args, dry_run: true })
      });
      const json = (await resp.json()) as DryRunResponse;
      setOpState({
        ...opState(),
        [op.name]: { ...state, dryRunning: false, dryRunResult: json }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setOpState({
        ...opState(),
        [op.name]: {
          ...state,
          dryRunning: false,
          dryRunResult: {
            ok: false,
            dry_run: true,
            operation: op.name,
            args: { days: state.days },
            would_affect: -1,
            note: msg
          }
        }
      });
    }
  };

  // ─── Real run ───────────────────────────────────────────────

  const runOperation = async (op: OperationDef) => {
    const state = opState()[op.name];
    if (!state || state.running) return;

    setOpState({
      ...opState(),
      [op.name]: { ...state, running: true, lastResult: null }
    });
    setConfirming(null);

    try {
      const args: { days?: number } = {};
      if (op.default_days !== undefined) args.days = state.days;
      const resp = await fetch("/api/admin/maintenance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: op.name, args })
      });
      const json = (await resp.json()) as RunResponse;
      setOpState({
        ...opState(),
        [op.name]: { ...state, running: false, lastResult: json }
      });
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setOpState({
        ...opState(),
        [op.name]: {
          ...state,
          running: false,
          lastResult: { ok: false, error: msg }
        }
      });
    }
  };

  const handleRunClick = (op: OperationDef) => {
    if (op.destructive) {
      setConfirming(op.name);
    } else {
      runOperation(op);
    }
  };

  // ─── Formatters ─────────────────────────────────────────────

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "success":
        return "success";
      case "failed":
        return "failed";
      case "running":
        return "running";
      case "partial":
        return "partial";
      default:
        return "";
    }
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div class="admin-config-shell">
      <div class="admin-config-header">
        <div>
          <h2>Maintenance</h2>
          <p>
            Schedule maintenance windows and run database cleanup
            operations. All runs are audit-logged. Use Dry Run to
            preview what would be deleted before committing.
          </p>
        </div>
        <div class="admin-config-actions">
          <GlassButton
            variant="secondary"
            size="compact"
            onClick={fetchAll}
            disabled={loading()}
            icon="refresh"
            loading={loading()}
          >
            Refresh
          </GlassButton>
        </div>
      </div>

      <Show when={error()}>
        <div class="admin-config-alert" role="alert">
          {error()}
        </div>
      </Show>

      <Show when={loading() && operations().length === 0}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
          <For each={Array.from({ length: 3 })}>
            {() => <div class="admin-config-skeleton" style={{ height: "120px" }} />}
          </For>
        </div>
      </Show>

      <Show when={!loading() || operations().length > 0}>
        {/* ─── Maintenance Window Scheduling ────────────────── */}
        <GlassCard class="admin-config-card" padding="comfortable">
          <div class="admin-config-card-header">
            <h3>Maintenance Window</h3>
            <Show
              when={maintWindow().enabled}
              fallback={
                <GlassBadge intent="default" label="Inactive" size="compact" />
              }
            >
              <GlassBadge intent="warning" label="Active" size="compact" />
            </Show>
          </div>
          <p class="admin-config-card-desc">
            When enabled, a banner is shown to all users during the
            scheduled window. The banner auto-dismisses after the end
            time. Maps to <code>maintenance_window</code> in app_config.
          </p>

          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--sp-3)",
              "margin-bottom": "var(--sp-4)"
            }}
          >
            <button
              class="admin-config-toggle"
              role="switch"
              aria-checked={maintWindow().enabled}
              aria-label="Toggle maintenance window"
              onClick={() =>
                setMaintWindow({
                  ...maintWindow(),
                  enabled: !maintWindow().enabled
                })
              }
            >
              <span class="toggle-knob" />
            </button>
            <span style={{ "font-size": "0.875rem", color: "var(--text-secondary)" }}>
              {maintWindow().enabled
                ? "Banner is visible to users during the window."
                : "Banner is hidden."}
            </span>
          </div>

          <div class="admin-maint-window-grid two-col">
            <div class="admin-config-field">
              <label>Start (scheduled_at)</label>
              <input
                type="datetime-local"
                value={isoToDatetimeLocal(maintWindow().scheduled_at)}
                onInput={(e) =>
                  setMaintWindow({
                    ...maintWindow(),
                    scheduled_at: datetimeLocalToIso(e.currentTarget.value)
                  })
                }
              />
              <span class="admin-config-field-hint">
                When the banner appears.
              </span>
            </div>
            <div class="admin-config-field">
              <label>End (ends_at)</label>
              <input
                type="datetime-local"
                value={isoToDatetimeLocal(maintWindow().ends_at)}
                onInput={(e) =>
                  setMaintWindow({
                    ...maintWindow(),
                    ends_at: datetimeLocalToIso(e.currentTarget.value)
                  })
                }
              />
              <span class="admin-config-field-hint">
                When the banner auto-dismisses. Leave empty for no end.
              </span>
            </div>
            <div class="admin-config-field admin-maint-window-message">
              <label>Banner Message</label>
              <textarea
                value={maintWindow().message}
                onInput={(e) =>
                  setMaintWindow({
                    ...maintWindow(),
                    message: e.currentTarget.value
                  })
                }
                maxlength={500}
                placeholder="CineLog is undergoing scheduled maintenance. Some features may be unavailable."
              />
              <span class="admin-config-field-hint">
                Max 500 characters. Shown in the banner.
              </span>
            </div>
          </div>

          <Show when={isWindowDirty()}>
            <div
              style={{
                display: "flex",
                gap: "var(--sp-2)",
                "justify-content": "flex-end",
                "margin-top": "var(--sp-4)"
              }}
            >
              <GlassButton
                variant="ghost"
                size="compact"
                onClick={() =>
                  setMaintWindow(
                    JSON.parse(origWindow()) as MaintenanceWindow
                  )
                }
              >
                Discard
              </GlassButton>
              <GlassButton
                variant="primary"
                size="compact"
                onClick={saveWindow}
                disabled={windowSaving()}
                loading={windowSaving()}
                icon="save"
              >
                {windowSaving() ? "Saving…" : "Save Window"}
              </GlassButton>
            </div>
          </Show>
        </GlassCard>

        {/* ─── Operations grid ──────────────────────────────── */}
        <div class="admin-maintenance-ops-grid">
          <For each={operations()}>
            {(op) => {
              const state = () =>
                opState()[op.name] ?? {
                  running: false,
                  dryRunning: false,
                  days: 0,
                  lastResult: null,
                  dryRunResult: null
                };
              return (
                <GlassCard class="admin-maint-op-card" padding="default">
                  <div class="admin-maint-op-header">
                    <h4>{op.label}</h4>
                    <Show when={op.destructive}>
                      <GlassBadge
                        intent="danger"
                        label="Destructive"
                        size="compact"
                      />
                    </Show>
                  </div>
                  <p class="admin-maint-op-desc">{op.description}</p>

                  <Show when={op.default_days !== undefined}>
                    <div class="admin-maint-op-days">
                      <label>Days cutoff:</label>
                      <input
                        type="number"
                        min={op.min_days ?? 1}
                        value={state().days}
                        disabled={state().running || state().dryRunning}
                        onInput={(e) =>
                          setOpState({
                            ...opState(),
                            [op.name]: {
                              ...state(),
                              days: Number(e.currentTarget.value)
                            }
                          })
                        }
                      />
                      <span class="days-hint">
                        (min {op.min_days ?? 1})
                      </span>
                    </div>
                  </Show>

                  {/* Dry run result */}
                  <Show when={state().dryRunResult}>
                    <div class="admin-maint-op-result dry-run">
                      <Show
                        when={state().dryRunResult!.ok}
                        fallback={
                          <span>
                            Dry run failed: {state().dryRunResult!.note}
                          </span>
                        }
                      >
                        <span>
                          🔍 Dry run:{" "}
                          {state().dryRunResult!.would_affect >= 0
                            ? `${state().dryRunResult!.would_affect.toLocaleString()} rows would be affected`
                            : "Count unavailable"}
                          <Show when={state().dryRunResult!.note}>
                            {" — "}
                            {state().dryRunResult!.note}
                          </Show>
                        </span>
                      </Show>
                    </div>
                  </Show>

                  {/* Last real-run result */}
                  <Show when={state().lastResult}>
                    <div
                      class={`admin-maint-op-result ${
                        state().lastResult!.ok ? "success" : "error"
                      }`}
                    >
                      <Show
                        when={state().lastResult!.ok}
                        fallback={
                          <span>{state().lastResult!.error}</span>
                        }
                      >
                        <span>
                          ✓{" "}
                          {state()
                            .lastResult!.rows_affected?.toLocaleString() ?? 0}{" "}
                          rows affected
                          <Show when={state().lastResult!.details?.note}>
                            {" — "}
                            {String(state().lastResult!.details!.note)}
                          </Show>
                        </span>
                      </Show>
                    </div>
                  </Show>

                  {/* Actions */}
                  <div class="admin-maint-op-actions">
                    <Show
                      when={!confirming() || confirming() !== op.name}
                      fallback={
                        <div class="admin-maint-confirm-bar">
                          <span>Confirm destructive op?</span>
                          <GlassButton
                            variant="danger"
                            size="compact"
                            onClick={() => runOperation(op)}
                            disabled={state().running}
                            loading={state().running}
                          >
                            Yes, run
                          </GlassButton>
                          <GlassButton
                            variant="ghost"
                            size="compact"
                            onClick={() => setConfirming(null)}
                            disabled={state().running}
                          >
                            Cancel
                          </GlassButton>
                        </div>
                      }
                    >
                      <GlassButton
                        variant="secondary"
                        size="compact"
                        onClick={() => dryRun(op)}
                        disabled={
                          state().running || state().dryRunning
                        }
                        loading={state().dryRunning}
                        icon="search"
                      >
                        {state().dryRunning ? "Estimating…" : "Dry Run"}
                      </GlassButton>
                      <GlassButton
                        variant={op.destructive ? "danger" : "primary"}
                        size="compact"
                        onClick={() => handleRunClick(op)}
                        disabled={state().running}
                        loading={state().running}
                        icon="play_arrow"
                      >
                        {state().running ? "Running…" : "Run"}
                      </GlassButton>
                    </Show>
                  </div>
                </GlassCard>
              );
            }}
          </For>
        </div>

        {/* ─── Recent runs ──────────────────────────────────── */}
        <GlassCard class="admin-config-card" padding="default">
          <div class="admin-config-card-header">
            <h3>Recent Runs</h3>
            <GlassBadge
              intent="default"
              label={`Last ${runs().length}`}
              size="compact"
            />
          </div>

          <Show
            when={runs().length > 0}
            fallback={
              <GlassEmptyState
                icon="history"
                title="No maintenance runs yet"
                message="Run an operation above to see its result here."
                variant="compact"
              />
            }
          >
            <div class="admin-maint-runs-scroll" style={{ "margin-top": "var(--sp-3)" }}>
              <table class="admin-maint-runs-table">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={runs()}>
                    {(run) => (
                      <tr>
                        <td>
                          <code>{run.operation}</code>
                        </td>
                        <td>
                          <span
                            class={`admin-maint-status ${statusClass(run.status)}`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td>{run.rows_affected.toLocaleString()}</td>
                        <td>{formatDate(run.started_at)}</td>
                        <td>
                          {formatDuration(run.started_at, run.finished_at)}
                        </td>
                        <td
                          style={{
                            "max-width": "300px",
                            overflow: "hidden",
                            "text-overflow": "ellipsis"
                          }}
                        >
                          {run.error ?? "—"}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </GlassCard>
      </Show>

      {/* ─── Toast ──────────────────────────────────────────────── */}
      <Show when={toast.msg()}>
        {(m) => (
          <div class={`admin-config-toast ${m().type}`}>{m().text}</div>
        )}
      </Show>
    </div>
  );
};

// ─── Toast helper ──────────────────────────────────────────────────

function signalToast() {
  const [msg, setMsg] = createSignal<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (text: string, type: "success" | "error") => {
    setMsg({ text, type });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setMsg(null), 2800);
  };
  return { msg, show };
}

export default AdminMaintenancePage;
