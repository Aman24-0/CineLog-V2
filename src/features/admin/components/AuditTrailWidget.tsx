// src/features/admin/components/AuditTrailWidget.tsx
//
// CineLog V2 — Audit Trail Dashboard Widget (Phase 6 Part 3 — Task 4)
// ---------------------------------------------------------------------
// Compact widget shown on the Admin Dashboard. Lists the 5 most recent
// admin_actions entries so the operator can see "what's been happening"
// at a glance without navigating to the full Audit Trail page.
//
// Each entry shows:
//   • The action (color-coded by category)
//   • The admin who performed it
//   • A relative timestamp ("5m ago")
//   • A link to the full /admin/logs page
//
// The widget fetches from /api/admin/logs?limit=5 on mount. Failures
// show a small "Failed to load" message but don't break the dashboard.

import {
  createSignal,
  onMount,
  Show,
  For,
  type Component
} from "solid-js";
import { A } from "@solidjs/router";

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

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function actionColor(action: string): string {
  if (action.startsWith("auth.")) return "rgb(165, 180, 252)";
  if (
    action.startsWith("user.disable") ||
    action.startsWith("user.delete")
  ) {
    return "rgb(252, 165, 165)";
  }
  if (action.startsWith("user.enable")) return "rgb(134, 239, 172)";
  if (action.startsWith("feature_flag")) return "rgb(253, 224, 71)";
  if (action.startsWith("2fa.")) return "rgb(196, 181, 253)";
  return "var(--text-secondary)";
}

const AuditTrailWidget: Component = () => {
  const [logs, setLogs] = createSignal<AuditLogRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        "/api/admin/logs?limit=5&page=1",
        { credentials: "include" }
      );
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ListLogsResponse;
      setLogs(data.logs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchLogs);

  return (
    <div
      style={{
        background: "var(--tier-1)",
        border: "1px solid var(--hairline)",
        "border-radius": "var(--radius-lg)",
        padding: "var(--sp-5)",
        "grid-column": "span 2"
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "var(--sp-4)"
        }}
      >
        <div
          style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)" }}
        >
          <span style={{ "font-size": "1.25rem" }} aria-hidden="true">
            📝
          </span>
          <div>
            <h3
              style={{
                margin: 0,
                "font-size": "1rem",
                "font-weight": 600,
                color: "var(--text)"
              }}
            >
              Recent Audit Trail
            </h3>
            <p
              style={{
                margin: "2px 0 0 0",
                "font-size": "0.75rem",
                color: "var(--text-muted)"
              }}
            >
              Last 5 admin actions
            </p>
          </div>
        </div>
        <A
          href="/admin/logs"
          style={{
            "font-size": "0.75rem",
            color: "var(--p)",
            "text-decoration": "none",
            "font-weight": 600
          }}
        >
          View all →
        </A>
      </div>

      <Show when={loading()}>
        <div
          style={{
            padding: "var(--sp-4)",
            "text-align": "center",
            color: "var(--text-muted)",
            "font-size": "0.8125rem"
          }}
        >
          Loading…
        </div>
      </Show>

      <Show when={error()}>
        <div
          style={{
            padding: "var(--sp-3)",
            color: "rgb(252, 165, 165)",
            "font-size": "0.8125rem"
          }}
        >
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={!loading() && !error() && logs().length === 0}>
        <div
          style={{
            padding: "var(--sp-4)",
            "text-align": "center",
            color: "var(--text-muted)",
            "font-size": "0.8125rem"
          }}
        >
          No admin actions yet.
        </div>
      </Show>

      <Show when={!loading() && !error() && logs().length > 0}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
          <For each={logs()}>
            {(log) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--sp-3)",
                  padding: "var(--sp-2) var(--sp-3)",
                  "border-radius": "var(--radius-md)",
                  background: "var(--tier-2)",
                  "font-size": "0.8125rem"
                }}
              >
                <code
                  style={{
                    color: actionColor(log.action),
                    "font-family": "monospace",
                    "font-size": "0.75rem",
                    "font-weight": 600,
                    flex: "0 0 auto",
                    "min-width": "120px"
                  }}
                >
                  {log.action}
                </code>
                <span style={{ color: "var(--text-secondary)", flex: 1 }}>
                  {log.admin_display_name ?? log.admin_username ?? "Unknown"}
                </span>
                <span
                  style={{
                    color: "var(--text-muted)",
                    "font-size": "0.75rem",
                    "font-family": "monospace"
                  }}
                >
                  {relativeTime(log.created_at)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default AuditTrailWidget;
