// src/features/admin/AdminMaintenancePage.tsx
//
// CineLog V2 — Admin Maintenance Page Component
// ---------------------------------------------------------------------
// Lists available maintenance operations and lets the admin run them.
// Each operation is a SQL function defined in the Phase 3 migration.
//
// LAYOUT:
//   [Operations grid — cards with description + "Run" button]
//   [Recent runs table — last 20 invocations with status, duration, rows]
//
// For operations that take a `days` parameter, the card shows a
// number input pre-filled with the default value. The min is
// enforced both client-side and server-side.
//
// All runs are recorded in the maintenance_runs table (see API route).

import { createSignal, Show, For, onMount, type Component } from "solid-js";

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

const AdminMaintenancePage: Component = () => {
  const [operations, setOperations] = createSignal<OperationDef[]>([]);
  const [runs, setRuns] = createSignal<MaintenanceRun[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  // Per-operation state: { running: boolean, days: number, lastResult: RunResponse | null }
  const [opState, setOpState] = createSignal<Record<string, {
    running: boolean;
    days: number;
    lastResult: RunResponse | null;
  }>>({});
  // Confirmation: which operation is awaiting "yes, run it" (for destructive ops)
  const [confirming, setConfirming] = createSignal<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/maintenance", { credentials: "include" });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as ListResponse;
      setOperations(data.operations);
      setRuns(data.recent_runs);
      // Initialize op state with defaults
      const init: Record<string, { running: boolean; days: number; lastResult: RunResponse | null }> = {};
      for (const op of data.operations) {
        init[op.name] = {
          running: false,
          days: op.default_days ?? 0,
          lastResult: null,
        };
      }
      setOpState(init);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchAll);

  const runOperation = async (op: OperationDef) => {
    const state = opState()[op.name];
    if (!state || state.running) return;

    // Update state: running
    setOpState({
      ...opState(),
      [op.name]: { ...state, running: true, lastResult: null },
    });
    setConfirming(null);

    try {
      const args: { days?: number } = {};
      if (op.default_days !== undefined) {
        args.days = state.days;
      }
      const resp = await fetch("/api/admin/maintenance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: op.name, args }),
      });
      const json = (await resp.json()) as RunResponse;
      setOpState({
        ...opState(),
        [op.name]: { ...state, running: false, lastResult: json },
      });
      // Refresh the runs list so the new run appears
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setOpState({
        ...opState(),
        [op.name]: {
          ...state,
          running: false,
          lastResult: { ok: false, error: msg },
        },
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

  const statusColor = (status: string) => {
    switch (status) {
      case "success":
        return "rgb(74, 222, 128)";
      case "failed":
        return "rgb(252, 165, 165)";
      case "running":
        return "rgb(253, 224, 71)";
      case "partial":
        return "rgb(251, 191, 36)";
      default:
        return "var(--text-muted)";
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div class="admin-maintenance-page" style={{ padding: "var(--sp-6)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "var(--sp-6)",
          "flex-wrap": "wrap",
          gap: "var(--sp-3)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, "font-size": "1.75rem", color: "var(--text)" }}>Maintenance</h1>
          <p style={{ margin: "var(--sp-1) 0 0 0", color: "var(--text-muted)", "font-size": "0.875rem" }}>
            Run database cleanup operations. All runs are audit-logged.
          </p>
        </div>
        <button type="button" onClick={fetchAll} disabled={loading()} style={btnStyle(loading())}>
          {loading() ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      <Show when={error()}>
        <div style={errorStyle}>{error()}</div>
      </Show>

      <Show when={loading() && operations().length === 0} fallback={null}>
        <div style={loadingStyle}>Loading operations…</div>
      </Show>

      {/* ─── Operations grid ─────────────────────────────── */}
      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "var(--sp-4)",
          "margin-bottom": "var(--sp-8)",
        }}
      >
        <For each={operations()}>
          {(op) => {
            const state = () => opState()[op.name] ?? { running: false, days: 0, lastResult: null };
            return (
              <div
                style={{
                  background: "var(--tier-1)",
                  border: "1px solid var(--hairline)",
                  "border-radius": "var(--radius-md)",
                  padding: "var(--sp-4)",
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--sp-3)",
                }}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)" }}>
                  <h3 style={{ margin: 0, "font-size": "1rem", color: "var(--text)", flex: 1 }}>
                    {op.label}
                  </h3>
                  <Show when={op.destructive}>
                    <span
                      style={{
                        "font-size": "0.6875rem",
                        "text-transform": "uppercase",
                        "letter-spacing": "0.05em",
                        color: "rgb(252, 165, 165)",
                        background: "rgba(239, 68, 68, 0.1)",
                        padding: "0.125rem 0.5rem",
                        "border-radius": "var(--radius-sm)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                      }}
                    >
                      Destructive
                    </span>
                  </Show>
                </div>
                <p style={{ margin: 0, "font-size": "0.8125rem", color: "var(--text-muted)", "line-height": "1.5" }}>
                  {op.description}
                </p>

                {/* Days input (if applicable) */}
                <Show when={op.default_days !== undefined}>
                  <label style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "font-size": "0.8125rem" }}>
                    <span style={{ color: "var(--text-secondary)", "min-width": "80px" }}>Days cutoff:</span>
                    <input
                      type="number"
                      min={op.min_days ?? 1}
                      value={state().days}
                      disabled={state().running}
                      onInput={(e) =>
                        setOpState({
                          ...opState(),
                          [op.name]: { ...state(), days: Number(e.currentTarget.value) },
                        })
                      }
                      style={{
                        width: "80px",
                        padding: "var(--sp-1) var(--sp-2)",
                        background: "var(--tier-2)",
                        border: "1px solid var(--hairline-2)",
                        "border-radius": "var(--radius-sm)",
                        color: "var(--text)",
                        "font-size": "0.8125rem",
                      }}
                    />
                    <span style={{ color: "var(--text-muted)", "font-size": "0.75rem" }}>
                      (min {op.min_days ?? 1})
                    </span>
                  </label>
                </Show>

                {/* Last result */}
                <Show when={state().lastResult}>
                  <div
                    style={{
                      "font-size": "0.75rem",
                      padding: "var(--sp-2) var(--sp-3)",
                      "border-radius": "var(--radius-sm)",
                      "background": state().lastResult!.ok
                        ? "rgba(74, 222, 128, 0.1)"
                        : "rgba(239, 68, 68, 0.1)",
                      border: `1px solid ${
                        state().lastResult!.ok
                          ? "rgba(74, 222, 128, 0.3)"
                          : "rgba(239, 68, 68, 0.3)"
                      }`,
                      color: state().lastResult!.ok
                        ? "rgb(187, 247, 208)"
                        : "rgb(252, 165, 165)",
                    }}
                  >
                    <Show when={state().lastResult!.ok} fallback={<span>{state().lastResult!.error}</span>}>
                      <span>
                        ✓ {state().lastResult!.rows_affected?.toLocaleString() ?? 0} rows affected
                        <Show when={state().lastResult!.details?.note}>
                          {" "}— {String(state().lastResult!.details!.note)}
                        </Show>
                      </span>
                    </Show>
                  </div>
                </Show>

                {/* Action button / confirmation */}
                <div style={{ "margin-top": "auto" }}>
                  <Show
                    when={!confirming() || confirming() !== op.name}
                    fallback={
                      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                        <button
                          type="button"
                          onClick={() => runOperation(op)}
                          disabled={state().running}
                          style={{
                            flex: 1,
                            padding: "var(--sp-2) var(--sp-4)",
                            background: "rgb(239, 68, 68)",
                            color: "#fff",
                            border: "none",
                            "border-radius": "var(--radius-md)",
                            "font-size": "0.8125rem",
                            "font-weight": "600",
                            cursor: state().running ? "not-allowed" : "pointer",
                          }}
                        >
                          {state().running ? "Running…" : "Yes, run it"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          disabled={state().running}
                          style={cancelBtnStyle}
                        >
                          Cancel
                        </button>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => handleRunClick(op)}
                      disabled={state().running}
                      style={btnStyle(state().running)}
                    >
                      {state().running ? "Running…" : "▶ Run"}
                    </button>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      {/* ─── Recent runs ─────────────────────────────────── */}
      <section>
        <h2 style={{ "font-size": "1.125rem", color: "var(--text)", margin: "0 0 var(--sp-4) 0" }}>
          Recent runs
        </h2>
        <Show when={runs().length > 0} fallback={<div style={emptyStyle}>No maintenance runs yet.</div>}>
          <div style={{ "overflow-x": "auto", background: "var(--tier-1)", border: "1px solid var(--hairline)", "border-radius": "var(--radius-md)" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Operation</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Rows</th>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Error</th>
                </tr>
              </thead>
              <tbody>
                <For each={runs()}>
                  {(run) => (
                    <tr>
                      <td style={tdStyle}>
                        <code style={codeStyle}>{run.operation}</code>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            color: statusColor(run.status),
                            "font-weight": "600",
                            "text-transform": "uppercase",
                            "font-size": "0.6875rem",
                            "letter-spacing": "0.05em",
                          }}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td style={tdStyle}>{run.rows_affected.toLocaleString()}</td>
                      <td style={tdStyle}>{formatDate(run.started_at)}</td>
                      <td style={tdStyle}>{formatDuration(run.started_at, run.finished_at)}</td>
                      <td style={{ ...tdStyle, "max-width": "300px", overflow: "hidden", "text-overflow": "ellipsis" }}>
                        {run.error ?? "—"}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────

const tableStyle = {
  width: "100%",
  "border-collapse": "collapse",
  "font-size": "0.8125rem",
} as const;

const thStyle = {
  "text-align": "left" as const,
  padding: "var(--sp-3)",
  "border-bottom": "1px solid var(--hairline)",
  color: "var(--text-muted)",
  "font-weight": "500" as const,
  "text-transform": "uppercase" as const,
  "letter-spacing": "0.05em",
  "font-size": "0.6875rem",
  "white-space": "nowrap" as const,
};

const tdStyle = {
  padding: "var(--sp-3)",
  "border-bottom": "1px solid var(--hairline)",
  color: "var(--text)",
  "white-space": "nowrap" as const,
};

const codeStyle = {
  "background": "var(--tier-2)",
  padding: "0.125rem 0.375rem",
  "border-radius": "var(--radius-sm)",
  "font-size": "0.75rem",
  color: "var(--text-secondary)",
} as const;

const emptyStyle = {
  padding: "var(--sp-8)",
  "text-align": "center",
  color: "var(--text-muted)",
  "font-size": "0.875rem",
  "background": "var(--tier-1)",
  border: "1px dashed var(--hairline-2)",
  "border-radius": "var(--radius-md)",
} as const;

const errorStyle = {
  "background": "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-3) var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  color: "rgb(252, 165, 165)",
  "font-size": "0.875rem",
} as const;

const loadingStyle = {
  padding: "var(--sp-8)",
  "text-align": "center",
  color: "var(--text-muted)",
  "font-size": "0.875rem",
} as const;

const cancelBtnStyle = {
  padding: "var(--sp-2) var(--sp-4)",
  "background": "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--hairline-2)",
  "border-radius": "var(--radius-md)",
  "font-size": "0.8125rem",
  "font-weight": "500",
  cursor: "pointer",
} as const;

function btnStyle(disabled: boolean) {
  return {
    padding: "var(--sp-2) var(--sp-4)",
    "background": disabled ? "var(--tier-3)" : "var(--p)",
    color: disabled ? "var(--text-muted)" : "var(--on-primary)",
    border: "none",
    "border-radius": "var(--radius-md)",
    "font-size": "0.8125rem",
    "font-weight": "600",
    cursor: disabled ? "not-allowed" : "pointer",
  } as const;
}

export default AdminMaintenancePage;
