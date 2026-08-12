// src/features/admin/AdminLogsPage.tsx
//
// CineLog V2 — Admin Audit Logs Page (Phase 9 Chunk 7 — Glass Redesign)
// ---------------------------------------------------------------------
// Shows recent admin actions with filters and a syntax-highlighted JSON
// viewer for the payload JSONB column. Read-only — logs are append-only.
//
// FEATURES:
//   • Glass UI (GlassCard, GlassInput, GlassBadge, GlassButton, GlassModal)
//   • Filters: Action Type, Admin User (free-text), Date Range (from/to),
//     Entity Type
//   • Paginated table (newest first)
//   • Click a row → modal with full payload rendered as syntax-highlighted JSON
//   • "Export to CSV" and "Export to JSON" buttons (downloads current filter)
//
// ZERO DUPLICATION:
//   This is the only admin page that surfaces audit logs. The Dashboard
//   widget (AuditTrailWidget) reads the same /api/admin/logs endpoint but
//   is a compact 5-row preview, not a filterable explorer — no overlap.
//
// MOBILE-FIRST:
//   Table is wrapped in a horizontal-scroll container with min-width so
//   columns don't collapse into each other. The filter bar stacks from
//   1 column (mobile) → 2 (tablet) → 4 (desktop). The JSON viewer wraps
//   long lines (white-space: pre-wrap; word-break: break-word).

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
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";

// ─── Types ──────────────────────────────────────────────────────

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

// Known action options (sourced from logAdminAction callers across the
// codebase). The dropdown is a convenience — admins can still type any
// action string into the URL via the API directly.
const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auth.login", label: "auth.login" },
  { value: "auth.logout", label: "auth.logout" },
  { value: "user.disable", label: "user.disable" },
  { value: "user.enable", label: "user.enable" },
  { value: "user.delete", label: "user.delete" },
  { value: "user.reset_preferences", label: "user.reset_preferences" },
  { value: "feature_flag.toggle", label: "feature_flag.toggle" },
  { value: "announcement.create", label: "announcement.create" },
  { value: "announcement.update", label: "announcement.update" },
  { value: "announcement.delete", label: "announcement.delete" },
  { value: "tmdb_cache.delete", label: "tmdb_cache.delete" },
  { value: "tmdb_cache.invalidate_expired", label: "tmdb_cache.invalidate_expired" },
  { value: "tmdb_cache.invalidate_all", label: "tmdb_cache.invalidate_all" },
  { value: "maintenance.run", label: "maintenance.run" },
  { value: "cron.manual_trigger", label: "cron.manual_trigger" },
  { value: "2fa.enroll", label: "2fa.enroll" },
  { value: "2fa.disable", label: "2fa.disable" }
];

const ENTITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "admin_session", label: "admin_session" },
  { value: "user", label: "user" },
  { value: "feature_flag", label: "feature_flag" },
  { value: "announcement", label: "announcement" },
  { value: "tmdb_cache", label: "tmdb_cache" },
  { value: "cron_job", label: "cron_job" },
  { value: "app_config", label: "app_config" },
  { value: "homepage_config", label: "homepage_config" }
];

// ─── Component ──────────────────────────────────────────────────

const AdminLogsPage: Component = () => {
  const [logs, setLogs] = createSignal<AuditLogRow[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [loading, setLoading] = createSignal(true);
  const [exporting, setExporting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = createSignal("");
  const [entityTypeFilter, setEntityTypeFilter] = createSignal("");
  const [adminFilter, setAdminFilter] = createSignal("");
  const [fromDate, setFromDate] = createSignal("");
  const [toDate, setToDate] = createSignal("");

  // Selected log for detail modal
  const [selected, setSelected] = createSignal<AuditLogRow | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page().toString(),
        limit: PAGE_SIZE.toString()
      });
      if (actionFilter()) params.set("action", actionFilter());
      if (entityTypeFilter()) params.set("entity_type", entityTypeFilter());
      if (adminFilter()) params.set("admin_id", adminFilter());
      if (fromDate()) params.set("from", new Date(fromDate()).toISOString());
      if (toDate()) {
        // End of day inclusive
        const d = new Date(toDate());
        d.setHours(23, 59, 59, 999);
        params.set("to", d.toISOString());
      }

      const resp = await fetch(`/api/admin/logs?${params}`, {
        credentials: "include"
      });
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

  const applyFilters = () => {
    setPage(1);
    void fetchLogs();
  };

  const clearFilters = () => {
    setActionFilter("");
    setEntityTypeFilter("");
    setAdminFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
    setTimeout(fetchLogs, 50);
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  };

  // ─── Export ───────────────────────────────────────────────────

  const buildExportData = async (): Promise<AuditLogRow[]> => {
    // Fetch all matching logs (up to 5000 to avoid memory blowup) by
    // walking pages until exhausted or cap reached.
    const cap = 5000;
    const collected: AuditLogRow[] = [];
    let p = 1;
    while (collected.length < cap) {
      const params = new URLSearchParams({
        page: p.toString(),
        limit: "200"
      });
      if (actionFilter()) params.set("action", actionFilter());
      if (entityTypeFilter()) params.set("entity_type", entityTypeFilter());
      if (adminFilter()) params.set("admin_id", adminFilter());
      if (fromDate()) params.set("from", new Date(fromDate()).toISOString());
      if (toDate()) {
        const d = new Date(toDate());
        d.setHours(23, 59, 59, 999);
        params.set("to", d.toISOString());
      }
      const resp = await fetch(`/api/admin/logs?${params}`, {
        credentials: "include"
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ListLogsResponse;
      collected.push(...data.logs);
      if (data.logs.length < 200) break;
      p++;
    }
    return collected;
  };

  const exportJson = async () => {
    setExporting(true);
    try {
      const rows = await buildExportData();
      const blob = new Blob([JSON.stringify(rows, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cinelog-audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await buildExportData();
      const headers = [
        "id",
        "created_at",
        "action",
        "entity_type",
        "entity_id",
        "admin_id",
        "admin_username",
        "admin_display_name",
        "ip_address",
        "payload"
      ];
      const escape = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : String(v);
        // Wrap in quotes; escape embedded quotes by doubling them
        if (/[",\n\r]/.test(s)) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.id,
            r.created_at,
            r.action,
            r.entity_type ?? "",
            r.entity_id ?? "",
            r.admin_id,
            r.admin_username ?? "",
            r.admin_display_name ?? "",
            r.ip_address ?? "",
            JSON.stringify(r.payload)
          ]
            .map(escape)
            .join(",")
        );
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cinelog-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ─── Action color (for code tag) ──────────────────────────────

  const actionColorClass = (action: string): string => {
    if (action.startsWith("auth.")) return "text-[rgb(165,180,252)]";
    if (
      action.startsWith("user.disable") ||
      action.startsWith("user.delete")
    ) {
      return "text-[rgb(252,165,165)]";
    }
    if (action.startsWith("user.enable")) return "text-[rgb(134,239,172)]";
    if (action.startsWith("feature_flag")) return "text-[rgb(253,224,71)]";
    if (action.startsWith("2fa.")) return "text-[rgb(196,181,253)]";
    if (action.startsWith("tmdb_cache.invalidate_all")) {
      return "text-[rgb(252,165,165)]";
    }
    if (action.startsWith("tmdb_cache")) return "text-[rgb(253,224,71)]";
    if (action.startsWith("cron.")) return "text-[rgb(147,197,253)]";
    return "text-text-secondary";
  };

  // ─── JSON syntax highlighter ──────────────────────────────────
  //
  // Renders a JSON object as syntax-highlighted HTML. We pre-escape
  // HTML entities in each token to prevent XSS via the payload.
  const renderJson = createMemo(() => {
    const sel = selected();
    if (!sel) return "";
    const payload = sel.payload;
    if (!payload || Object.keys(payload).length === 0) return "";
    const json = JSON.stringify(payload, null, 2);
    // Tokenize: strings, numbers, booleans, null, keys, punctuation.
    // We use a regex with capture groups to identify each token type.
    const escapeHtml = (s: string): string =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Match: string (key or value), number, boolean, null, punctuation
    const tokenRegex =
      /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],])/g;

    return json.replace(
      tokenRegex,
      (_match, key, str, num, bool, nul, punct) => {
        if (key) {
          return `<span class="json-key">${escapeHtml(key)}</span>`;
        }
        if (str) {
          return `<span class="json-string">${escapeHtml(str)}</span>`;
        }
        if (num) {
          return `<span class="json-number">${escapeHtml(num)}</span>`;
        }
        if (bool) {
          return `<span class="json-boolean">${escapeHtml(bool)}</span>`;
        }
        if (nul) {
          return `<span class="json-null">${escapeHtml(nul)}</span>`;
        }
        return escapeHtml(punct);
      }
    );
  });

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div class="admin-devtools-shell">
      <header class="admin-devtools-header">
        <div>
          <h2>Audit Trail</h2>
          <p>
            Immutable record of all admin actions. Read-only — logs are
            append-only and cannot be modified or deleted.
          </p>
        </div>
        <div class="admin-devtools-actions">
          <GlassButton
            variant="glass"
            size="compact"
            icon="download"
            onClick={exportJson}
            loading={exporting()}
          >
            Export JSON
          </GlassButton>
          <GlassButton
            variant="glass"
            size="compact"
            icon="table_view"
            onClick={exportCsv}
            loading={exporting()}
          >
            Export CSV
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="compact"
            icon="refresh"
            onClick={fetchLogs}
          >
            Refresh
          </GlassButton>
        </div>
      </header>

      {/* Filter bar */}
      <GlassCard padding="default" class="admin-devtools-card">
        <div class="admin-filter-bar">
          <div class="admin-filter-field">
            <label for="log-filter-action">Action Type</label>
            <select
              id="log-filter-action"
              value={actionFilter()}
              onChange={(e) => setActionFilter(e.currentTarget.value)}
            >
              <option value="">All actions</option>
              <For each={ACTION_OPTIONS}>
                {(opt) => (
                  <option value={opt.value}>{opt.label}</option>
                )}
              </For>
            </select>
          </div>

          <div class="admin-filter-field">
            <label for="log-filter-entity">Entity Type</label>
            <select
              id="log-filter-entity"
              value={entityTypeFilter()}
              onChange={(e) => setEntityTypeFilter(e.currentTarget.value)}
            >
              <option value="">All entities</option>
              <For each={ENTITY_OPTIONS}>
                {(opt) => (
                  <option value={opt.value}>{opt.label}</option>
                )}
              </For>
            </select>
          </div>

          <div class="admin-filter-field">
            <label for="log-filter-admin">Admin User ID</label>
            <input
              id="log-filter-admin"
              type="text"
              placeholder="UUID or username…"
              value={adminFilter()}
              onInput={(e) => setAdminFilter(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>

          <div class="admin-filter-field">
            <label for="log-filter-from">From Date</label>
            <input
              id="log-filter-from"
              type="date"
              value={fromDate()}
              onInput={(e) => setFromDate(e.currentTarget.value)}
            />
          </div>

          <div class="admin-filter-field">
            <label for="log-filter-to">To Date</label>
            <input
              id="log-filter-to"
              type="date"
              value={toDate()}
              onInput={(e) => setToDate(e.currentTarget.value)}
            />
          </div>

          <div class="admin-filter-actions">
            <GlassButton
              variant="primary"
              size="compact"
              icon="filter_alt"
              onClick={applyFilters}
            >
              Apply
            </GlassButton>
            <GlassButton
              variant="ghost"
              size="compact"
              onClick={clearFilters}
            >
              Clear
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      <Show when={error()}>
        <div class="admin-devtools-alert" role="alert">
          {error()}
        </div>
      </Show>

      {/* Logs table */}
      <GlassCard padding="none" class="admin-devtools-card">
        <Show when={loading()}>
          <GlassLoadingState message="Loading audit trail…" class="!py-8" />
        </Show>

        <Show when={!loading() && logs().length === 0}>
          <div class="p-6">
            <GlassEmptyState
              icon="receipt_long"
              title="No log entries found"
              message="No audit log entries match your current filters. Try clearing filters or expanding the date range."
              surface
            />
          </div>
        </Show>

        <Show when={!loading() && logs().length > 0}>
          <div class="admin-logs-scroll">
            <table class="admin-logs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                <For each={logs()}>
                  {(log) => (
                    <tr
                      onClick={() => setSelected(log)}
                      classList={{
                        "selected-row": selected()?.id === log.id
                      }}
                    >
                      <td>
                        <span style={{ "white-space": "nowrap" }}>
                          {formatDate(log.created_at)}
                        </span>
                      </td>
                      <td>
                        <div style={{ "font-weight": "500", color: "var(--text)" }}>
                          {log.admin_display_name ?? "Unknown"}
                        </div>
                        <div style={{ "font-size": "0.6875rem", color: "var(--text-muted)" }}>
                          @{log.admin_username ?? "unknown"}
                        </div>
                      </td>
                      <td class="action-cell">
                        <code class={actionColorClass(log.action)}>
                          {log.action}
                        </code>
                      </td>
                      <td class="entity-cell">
                        <Show when={log.entity_type}>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {log.entity_type}
                          </span>
                          <Show when={log.entity_id}>
                            <span class="entity-id" title={log.entity_id ?? ""}>
                              {log.entity_id}
                            </span>
                          </Show>
                        </Show>
                        <Show when={!log.entity_type}>
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        </Show>
                      </td>
                      <td>
                        <span
                          style={{
                            "font-family": "monospace",
                            "font-size": "0.75rem",
                            color: "var(--text-muted)"
                          }}
                        >
                          {log.ip_address ?? "—"}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Show when={total() > PAGE_SIZE}>
            <div class="admin-pagination">
              <span>
                Showing {(page() - 1) * PAGE_SIZE + 1}–
                {Math.min(page() * PAGE_SIZE, total())} of {total()}
              </span>
              <div class="admin-pagination-controls">
                <GlassButton
                  variant="glass"
                  size="compact"
                  disabled={page() === 1}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                    setTimeout(fetchLogs, 0);
                  }}
                >
                  ← Prev
                </GlassButton>
                <span style={{ padding: "6px 12px" }}>
                  {page()} / {totalPages()}
                </span>
                <GlassButton
                  variant="glass"
                  size="compact"
                  disabled={page() >= totalPages()}
                  onClick={() => {
                    setPage((p) => Math.min(totalPages(), p + 1));
                    setTimeout(fetchLogs, 0);
                  }}
                >
                  Next →
                </GlassButton>
              </div>
            </div>
          </Show>
        </Show>
      </GlassCard>

      {/* Detail modal with JSON viewer */}
      <GlassModal
        open={selected() !== null}
        onClose={() => setSelected(null)}
        title="Log Detail"
        icon="receipt_long"
        size="lg"
      >
        <Show when={selected()}>
          {(log) => (
            <div class="admin-log-detail-drawer">
              <div class="admin-log-detail-meta">
                <div class="admin-log-detail-row">
                  <dt>Time</dt>
                  <dd>{formatDate(log().created_at)}</dd>
                </div>
                <div class="admin-log-detail-row">
                  <dt>Action</dt>
                  <dd>
                    <code class={actionColorClass(log().action)}>
                      {log().action}
                    </code>
                  </dd>
                </div>
                <div class="admin-log-detail-row">
                  <dt>Admin</dt>
                  <dd>
                    {log().admin_display_name ?? "Unknown"}{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      @{log().admin_username ?? "unknown"}
                    </span>
                  </dd>
                </div>
                <div class="admin-log-detail-row">
                  <dt>Entity</dt>
                  <dd>
                    {log().entity_type ?? "—"}
                    <Show when={log().entity_id}>
                      <span
                        style={{
                          "font-family": "monospace",
                          "font-size": "0.75rem",
                          "margin-left": "var(--sp-2)",
                          color: "var(--text-muted)"
                        }}
                      >
                        {log().entity_id}
                      </span>
                    </Show>
                  </dd>
                </div>
                <div class="admin-log-detail-row">
                  <dt>IP Address</dt>
                  <dd class="mono">{log().ip_address ?? "—"}</dd>
                </div>
                <div class="admin-log-detail-row">
                  <dt>Log ID</dt>
                  <dd class="mono">{log().id}</dd>
                </div>
                <div
                  class="admin-log-detail-row"
                  style={{ "grid-column": "1 / -1" }}
                >
                  <dt>User-Agent</dt>
                  <dd style={{ "word-break": "break-all" }}>
                    {log().user_agent ?? "—"}
                  </dd>
                </div>
              </div>

              {/* Payload JSON viewer */}
              <div>
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--sp-2)",
                    "margin-bottom": "var(--sp-2)"
                  }}
                >
                  <GlassBadge
                    label="Payload"
                    intent="info"
                    size="compact"
                  />
                  <Show when={Object.keys(log().payload).length > 0}>
                    <GlassButton
                      variant="ghost"
                      size="compact"
                      icon="content_copy"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          JSON.stringify(log().payload, null, 2)
                        );
                      }}
                    >
                      Copy
                    </GlassButton>
                  </Show>
                </div>
                <Show
                  when={Object.keys(log().payload).length > 0}
                  fallback={
                    <div class="admin-json-empty">
                      No payload recorded for this action.
                    </div>
                  }
                >
                  <pre
                    class="admin-json-viewer"
                    innerHTML={renderJson()}
                  />
                </Show>
              </div>
            </div>
          )}
        </Show>
      </GlassModal>
    </div>
  );
};

export default AdminLogsPage;
