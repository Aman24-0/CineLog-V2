// src/features/admin/AdminLogsPage.tsx
//
// CineLog V2 — Admin Audit Logs Page Component
// ---------------------------------------------------------------------
// Shows recent admin actions with filters: action, entity_type, date.
// Read-only (logs are append-only — no edit/delete is possible).
//
// LAYOUT:
//   [Filter bar: action, entity_type, refresh]
//   [Logs table — newest first]
//   [Pagination]

import { createSignal, Show, For, onMount, type Component } from "solid-js";

interface AuditLogRow {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  admin_username: string | null;
  admin_display_name: string | null;
}

interface ListLogsResponse {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 50;

const AdminLogsPage: Component = () => {
  const [logs, setLogs] = createSignal<AuditLogRow[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = createSignal("");
  const [entityTypeFilter, setEntityTypeFilter] = createSignal("");

  // Selected log (for detail panel)
  const [selected, setSelected] = createSignal<AuditLogRow | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page().toString(),
        limit: PAGE_SIZE.toString(),
      });
      if (actionFilter()) params.set("action", actionFilter());
      if (entityTypeFilter()) params.set("entity_type", entityTypeFilter());

      const resp = await fetch(`/api/admin/logs?${params}`, { credentials: "include" });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as ListLogsResponse;
      setLogs(data.logs);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchLogs);

  const totalPages = () => Math.max(1, Math.ceil(total() / PAGE_SIZE));

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  };

  const actionColor = (action: string): string => {
    if (action.startsWith("auth.")) return "rgb(165, 180, 252)";
    if (action.startsWith("user.disable") || action.startsWith("user.delete")) {
      return "rgb(252, 165, 165)";
    }
    if (action.startsWith("user.enable")) return "rgb(134, 239, 172)";
    if (action.startsWith("feature_flag")) return "rgb(253, 224, 71)";
    return "var(--text-secondary)";
  };

  return (
    <div>
      <div style={{ "margin-bottom": "var(--sp-6)" }}>
        <h2
          style={{
            "font-size": "1.5rem",
            "font-weight": "700",
            margin: "0 0 var(--sp-1) 0",
            color: "var(--text)",
          }}
        >
          Audit Logs
        </h2>
        <p
          style={{
            "font-size": "0.875rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Immutable record of all admin actions. Read-only.
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "var(--sp-3)",
          "margin-bottom": "var(--sp-4)",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
        <select
          value={actionFilter()}
          onChange={(e) => setActionFilter(e.currentTarget.value)}
          style={inputStyle}
        >
          <option value="">All actions</option>
          <option value="auth.login">auth.login</option>
          <option value="auth.logout">auth.logout</option>
          <option value="user.disable">user.disable</option>
          <option value="user.enable">user.enable</option>
          <option value="user.delete">user.delete</option>
          <option value="user.reset_preferences">user.reset_preferences</option>
          <option value="feature_flag.toggle">feature_flag.toggle</option>
        </select>

        <select
          value={entityTypeFilter()}
          onChange={(e) => setEntityTypeFilter(e.currentTarget.value)}
          style={inputStyle}
        >
          <option value="">All entities</option>
          <option value="admin_session">admin_session</option>
          <option value="user">user</option>
          <option value="feature_flag">feature_flag</option>
        </select>

        <button
          onClick={() => {
            setPage(1);
            void fetchLogs();
          }}
          style={{
            "background": "var(--p)",
            color: "var(--on-primary)",
            border: "none",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-2) var(--sp-4)",
            "font-size": "0.8125rem",
            "font-weight": "500",
            cursor: "pointer",
          }}
        >
          Apply
        </button>

        <button
          onClick={() => {
            setActionFilter("");
            setEntityTypeFilter("");
            setPage(1);
            setTimeout(fetchLogs, 50);
          }}
          style={{
            "background": "transparent",
            border: "1px solid var(--hairline-2)",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-2) var(--sp-4)",
            "font-size": "0.8125rem",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Clear
        </button>

        <div style={{ "margin-left": "auto" }}>
          <button
            onClick={fetchLogs}
            style={{
              "background": "transparent",
              border: "1px solid var(--hairline-2)",
              "border-radius": "var(--radius-md)",
              padding: "var(--sp-2) var(--sp-4)",
              "font-size": "0.8125rem",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <Show when={error()}>
        <div
          role="alert"
          style={{
            "background": "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-4)",
            "margin-bottom": "var(--sp-4)",
            "font-size": "0.875rem",
            color: "rgb(252, 165, 165)",
          }}
        >
          {error()}
        </div>
      </Show>

      {/* Logs table */}
      <div
        style={{
          "background": "var(--tier-1)",
          border: "1px solid var(--hairline)",
          "border-radius": "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ "overflow-x": "auto" }}>
          <table
            style={{
              width: "100%",
              "border-collapse": "collapse",
              "font-size": "0.8125rem",
            }}
          >
            <thead>
              <tr
                style={{
                  "background": "var(--tier-2)",
                  "text-align": "left",
                  "border-bottom": "1px solid var(--hairline)",
                }}
              >
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Admin</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>IP</th>
              </tr>
            </thead>
            <tbody>
              <Show when={loading()}>
                <tr>
                  <td colspan={5} style={{ padding: "var(--sp-6)", "text-align": "center", color: "var(--text-muted)" }}>
                    Loading…
                  </td>
                </tr>
              </Show>

              <Show when={!loading() && logs().length === 0}>
                <tr>
                  <td colspan={5} style={{ padding: "var(--sp-6)", "text-align": "center", color: "var(--text-muted)" }}>
                    No log entries found
                  </td>
                </tr>
              </Show>

              <For each={logs()}>
                {(log) => (
                  <tr
                    onClick={() => setSelected(log)}
                    style={{
                      "border-bottom": "1px solid var(--hairline)",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tier-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>
                      <span style={{ "white-space": "nowrap" }}>{formatDate(log.created_at)}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ "font-weight": "500", color: "var(--text)" }}>
                        {log.admin_display_name ?? "Unknown"}
                      </div>
                      <div style={{ "font-size": "0.6875rem", color: "var(--text-muted)" }}>
                        @{log.admin_username ?? "unknown"}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <code
                        style={{
                          color: actionColor(log.action),
                          "font-size": "0.75rem",
                          "font-weight": "500",
                        }}
                      >
                        {log.action}
                      </code>
                    </td>
                    <td style={tdStyle}>
                      <Show when={log.entity_type}>
                        <span style={{ color: "var(--text-secondary)" }}>{log.entity_type}</span>
                        <Show when={log.entity_id}>
                          <span
                            style={{
                              "font-size": "0.6875rem",
                              color: "var(--text-muted)",
                              "margin-left": "var(--sp-2)",
                              "font-family": "monospace",
                            }}
                          >
                            {log.entity_id?.length && log.entity_id.length > 12
                              ? log.entity_id.slice(0, 8) + "…"
                              : log.entity_id}
                          </span>
                        </Show>
                      </Show>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ "font-family": "monospace", "font-size": "0.75rem", color: "var(--text-muted)" }}>
                        {log.ip_address ?? "—"}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Show when={total() > PAGE_SIZE}>
        <div
          style={{
            display: "flex",
            "justify-content": "space-between",
            "align-items": "center",
            "margin-top": "var(--sp-4)",
            "font-size": "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          <span>
            Showing {(page() - 1) * PAGE_SIZE + 1}–
            {Math.min(page() * PAGE_SIZE, total())} of {total()}
          </span>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button
              disabled={page() === 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                setTimeout(fetchLogs, 0);
              }}
              style={pageBtnStyle(page() === 1)}
            >
              ← Prev
            </button>
            <span style={{ padding: "6px 12px" }}>
              {page()} / {totalPages()}
            </span>
            <button
              disabled={page() >= totalPages()}
              onClick={() => {
                setPage((p) => Math.min(totalPages(), p + 1));
                setTimeout(fetchLogs, 0);
              }}
              style={pageBtnStyle(page() >= totalPages())}
            >
              Next →
            </button>
          </div>
        </div>
      </Show>

      {/* Detail panel */}
      <Show when={selected()}>
        {(log) => (
          <div
            style={{
              position: "fixed",
              inset: 0,
              "background": "rgba(0,0,0,0.7)",
              "backdrop-filter": "blur(4px)",
              "z-index": 1000,
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              padding: "var(--sp-4)",
            }}
            onClick={() => setSelected(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                "background": "var(--tier-1)",
                border: "1px solid var(--hairline)",
                "border-radius": "var(--radius-lg)",
                padding: "var(--sp-6)",
                "max-width": "640px",
                width: "100%",
                "max-height": "80vh",
                "overflow-y": "auto",
                "box-shadow": "var(--shadow-xl)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  "justify-content": "space-between",
                  "align-items": "start",
                  "margin-bottom": "var(--sp-4)",
                }}
              >
                <h3
                  style={{
                    "font-size": "1.125rem",
                    "font-weight": "600",
                    margin: 0,
                    color: "var(--text)",
                  }}
                >
                  Log Detail
                </h3>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    "background": "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    "font-size": "1.25rem",
                    cursor: "pointer",
                    "padding": "0 4px",
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <dl style={{ display: "grid", "grid-template-columns": "120px 1fr", gap: "var(--sp-2) var(--sp-4)", "font-size": "0.875rem" }}>
                <dt style={{ color: "var(--text-muted)" }}>ID</dt>
                <dd style={{ margin: 0, "font-family": "monospace", "font-size": "0.75rem", color: "var(--text-secondary)" }}>{log().id}</dd>

                <dt style={{ color: "var(--text-muted)" }}>Time</dt>
                <dd style={{ margin: 0, color: "var(--text)" }}>{formatDate(log().created_at)}</dd>

                <dt style={{ color: "var(--text-muted)" }}>Admin</dt>
                <dd style={{ margin: 0, color: "var(--text)" }}>
                  {log().admin_display_name ?? "Unknown"}{" "}
                  <span style={{ color: "var(--text-muted)" }}>@{log().admin_username ?? "unknown"}</span>
                </dd>

                <dt style={{ color: "var(--text-muted)" }}>Action</dt>
                <dd style={{ margin: 0 }}>
                  <code style={{ color: actionColor(log().action) }}>{log().action}</code>
                </dd>

                <dt style={{ color: "var(--text-muted)" }}>Entity</dt>
                <dd style={{ margin: 0, color: "var(--text-secondary)" }}>
                  {log().entity_type ?? "—"}
                  <Show when={log().entity_id}>
                    <span style={{ "font-family": "monospace", "font-size": "0.75rem", "margin-left": "var(--sp-2)" }}>
                      {log().entity_id}
                    </span>
                  </Show>
                </dd>

                <dt style={{ color: "var(--text-muted)" }}>IP</dt>
                <dd style={{ margin: 0, "font-family": "monospace", "font-size": "0.75rem", color: "var(--text-secondary)" }}>
                  {log().ip_address ?? "—"}
                </dd>

                <dt style={{ color: "var(--text-muted)" }}>User-Agent</dt>
                <dd style={{ margin: 0, "font-size": "0.75rem", color: "var(--text-muted)", "word-break": "break-all" }}>
                  {log().user_agent ?? "—"}
                </dd>
              </dl>

              <Show when={Object.keys(log().payload).length > 0}>
                <div style={{ "margin-top": "var(--sp-5)" }}>
                  <div
                    style={{
                      "font-size": "0.75rem",
                      "font-weight": "600",
                      color: "var(--text-muted)",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.05em",
                      "margin-bottom": "var(--sp-2)",
                    }}
                  >
                    Payload
                  </div>
                  <pre
                    style={{
                      "background": "var(--tier-2)",
                      border: "1px solid var(--hairline)",
                      "border-radius": "var(--radius-md)",
                      padding: "var(--sp-3)",
                      "font-size": "0.75rem",
                      "font-family": "monospace",
                      color: "var(--text-secondary)",
                      "white-space": "pre-wrap",
                      "word-break": "break-all",
                      margin: 0,
                      "max-height": "300px",
                      "overflow-y": "auto",
                    }}
                  >
                    {JSON.stringify(log().payload, null, 2)}
                  </pre>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

// ─── Style helpers ────────────────────────────────────────────────

const thStyle: Record<string, string> = {
  padding: "var(--sp-3) var(--sp-4)",
  "font-weight": "600",
  color: "var(--text-secondary)",
  "text-align": "left",
};

const tdStyle: Record<string, string> = {
  padding: "var(--sp-3) var(--sp-4)",
  color: "var(--text-secondary)",
  "vertical-align": "top",
};

const inputStyle: Record<string, string> = {
  padding: "var(--sp-2) var(--sp-3)",
  "background": "var(--tier-2)",
  border: "1px solid var(--hairline-2)",
  "border-radius": "var(--radius-md)",
  color: "var(--text)",
  "font-size": "0.8125rem",
  outline: "none",
  cursor: "pointer",
};

function pageBtnStyle(disabled: boolean): Record<string, string> {
  return {
    "background": "transparent",
    border: "1px solid var(--hairline-2)",
    "border-radius": "var(--radius-sm)",
    padding: "6px 12px",
    "font-size": "0.8125rem",
    color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? "0.5" : "1",
  };
}

export default AdminLogsPage;
