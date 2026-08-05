// src/features/admin/components/AuditTrailWidget.tsx
//
// CineLog V2 — Audit Trail Dashboard Widget
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
//
// PHASE 9 CHUNK 1 — Glass restyle:
//   The previous version used inline `background: var(--tier-1)` and
//   hand-rolled borders. It now wraps in <GlassCard> and uses Glass
//   design tokens (text-text-*, bg-tier-2, border-glass-border) so it
//   matches the redesigned AdminDashboard. No logic changes — only
//   presentation.

import {
  createSignal,
  onMount,
  Show,
  For,
  type Component
} from "solid-js";
import { A } from "@solidjs/router";
import { GlassCard } from "~/shared/ui/glass/GlassCard";

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

// Tailwind text-color class per action category. Kept as a class string
// (not raw CSS) so the classes are statically present for the JIT
// compiler to see — dynamic `style={{ color: ... }}` would work too,
// but using tokens keeps the widget consistent with the Glass system.
function actionColorClass(action: string): string {
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
  return "text-text-secondary";
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
    <GlassCard padding="default" class="h-full">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span
            class="material-symbols-outlined text-xl text-primary"
            style={{
              "font-variation-settings":
                "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
            }}
            aria-hidden="true"
          >
            history_edu
          </span>
          <div>
            <h3 class="m-0 text-sm font-semibold text-text-strong">
              Recent Admin Actions
            </h3>
            <p class="mt-0.5 text-xs text-text-muted">
              Last 5 admin actions
            </p>
          </div>
        </div>
        <A
          href="/admin/logs"
          class="text-xs font-semibold text-primary no-underline hover:underline"
        >
          View all →
        </A>
      </div>

      <Show when={loading()}>
        <div class="flex items-center justify-center gap-2 px-4 py-6 text-xs text-text-muted">
          <span
            class="material-symbols-outlined text-base"
            style={{
              animation: "softPulse 1.2s ease-in-out infinite"
            }}
            aria-hidden="true"
          >
            progress_activity
          </span>
          Loading…
        </div>
      </Show>

      <Show when={error()}>
        <div class="px-3 py-2 text-xs text-danger">
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={!loading() && !error() && logs().length === 0}>
        <div class="px-4 py-6 text-center text-xs text-text-muted">
          No admin actions yet.
        </div>
      </Show>

      <Show when={!loading() && !error() && logs().length > 0}>
        <div class="flex flex-col gap-1">
          <For each={logs()}>
            {(log) => (
              <div class="flex items-center gap-3 rounded-md bg-tier-2 px-3 py-2 text-xs">
                <code
                  class={`min-w-[120px] flex-shrink-0 font-mono text-[11px] font-semibold ${actionColorClass(log.action)}`}
                >
                  {log.action}
                </code>
                <span class="flex-1 text-text-secondary">
                  {log.admin_display_name ?? log.admin_username ?? "Unknown"}
                </span>
                <span class="font-mono text-[11px] text-text-muted">
                  {relativeTime(log.created_at)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </GlassCard>
  );
};

export default AuditTrailWidget;
