// src/features/admin/AdminDatabasePage.tsx
//
// CineLog V2 — Admin Database Inspector (Phase 9 Chunk 7)
// ---------------------------------------------------------------------
// Lists all tables in the public schema with their row counts and a
// read-only RLS Policy Viewer. Read-only — no mutations.
//
// FEATURES:
//   • Glass UI (GlassCard, GlassInput, GlassButton, GlassBadge)
//   • Search bar to filter tables by name.
//   • Sortable table: name, row count, RLS status, policy count.
//   • Click a row → expands to show all RLS policies for that table
//     (sourced from the static migration map in /api/admin/database).
//   • Refresh button to re-fetch row counts.
//
// STRICT USER-SIDE MAPPING:
//   Only the 27 tables in public.* are inspected (per
//   src/lib/supabase/database.types.ts). No dummy tables. Row counts
//   are fetched live via `supabase.from(t).select('*', { count:
//   'exact', head: true })` — accurate but may be slow on large
//   tables (e.g. activity_log).
//
//   On-disk size is NOT available via PostgREST (requires
//   pg_total_relation_size()). We surface this fact in an info banner
//   rather than fabricate numbers.
//
//   RLS policies are sourced from a static map maintained in the API
//   endpoint (sourced verbatim from supabase/migrations/*.sql). This
//   is NOT live DB introspection — it's a reflection of migration
//   history. The UI clearly labels this.
//
// MOBILE-FIRST:
//   Table is wrapped in a horizontal-scroll container with min-width
//   so columns don't collapse. Search bar is full-width on mobile.
//   Policy detail rows stack vertically.

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";

// ─── Types (mirror API) ─────────────────────────────────────────

interface TableInfo {
  name: string;
  row_count: number | null;
  size_bytes: number | null;
  size_pretty: string | null;
  rls_enabled: boolean;
  policy_count: number;
  error?: string;
}

interface RlsPolicy {
  name: string;
  command: string;
  roles: string[];
  using: string;
  check: string;
}

interface PolicyResponse {
  table: string;
  rls_enabled: boolean;
  policies: RlsPolicy[];
  source: string;
}

interface DatabaseListResponse {
  tables: TableInfo[];
  total_tables: number;
  size_note: string;
  policies_source: string;
}

// ─── Component ──────────────────────────────────────────────────

const AdminDatabasePage: Component = () => {
  const [tables, setTables] = createSignal<TableInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [sizeNote, setSizeNote] = createSignal<string>("");
  const [search, setSearch] = createSignal("");
  const [sortKey, setSortKey] = createSignal<"name" | "rows" | "policies">(
    "name"
  );
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [policyCache, setPolicyCache] = createSignal<
    Map<string, PolicyResponse>
  >(new Map());
  const [loadingPolicies, setLoadingPolicies] = createSignal<Set<string>>(
    new Set()
  );
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ─── Data fetcher ─────────────────────────────────────────────

  const fetchTables = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/database", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as DatabaseListResponse;
      setTables(data.tables);
      setSizeNote(data.size_note);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchTables);

  // ─── Expand/collapse + policy fetch ───────────────────────────

  const toggleExpand = async (tableName: string) => {
    const next = new Set(expanded());
    if (next.has(tableName)) {
      next.delete(tableName);
      setExpanded(next);
      return;
    }
    next.add(tableName);
    setExpanded(next);

    // Lazy-load policies if not cached
    if (!policyCache().has(tableName)) {
      const loadingSet = new Set(loadingPolicies());
      loadingSet.add(tableName);
      setLoadingPolicies(loadingSet);

      try {
        const resp = await fetch(
          `/api/admin/database?table=${encodeURIComponent(tableName)}&policies=1`,
          { credentials: "include" }
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as PolicyResponse;
        const nextCache = new Map(policyCache());
        nextCache.set(tableName, data);
        setPolicyCache(nextCache);
      } catch (err) {
        showToast(
          err instanceof Error
            ? `Failed to load policies: ${err.message}`
            : "Failed to load policies",
          "error"
        );
      } finally {
        const setLoading = new Set(loadingPolicies());
        setLoading.delete(tableName);
        setLoadingPolicies(setLoading);
      }
    }
  };

  // ─── Filtered + sorted tables (memoized) ──────────────────────

  const filteredTables = createMemo(() => {
    const q = search().trim().toLowerCase();
    let list = tables();
    if (q) {
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    const key = sortKey();
    sorted.sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name);
      if (key === "rows") {
        const ar = a.row_count ?? -1;
        const br = b.row_count ?? -1;
        return br - ar; // descending — biggest tables first
      }
      if (key === "policies") {
        return b.policy_count - a.policy_count;
      }
      return 0;
    });
    return sorted;
  });

  // ─── Helpers ──────────────────────────────────────────────────

  const formatRowCount = (count: number | null): string => {
    if (count === null) return "—";
    if (count === 0) return "0";
    return count.toLocaleString();
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div class="admin-devtools-shell">
      <header class="admin-devtools-header">
        <div>
          <h2>Database Inspector</h2>
          <p>
            Read-only view of all tables in the public schema. Row counts
            are fetched live; RLS policies are sourced from the migration
            history. No mutations are possible from this page.
          </p>
        </div>
        <div class="admin-devtools-actions">
          <GlassButton
            variant="secondary"
            size="compact"
            icon="refresh"
            onClick={fetchTables}
            loading={loading()}
          >
            Refresh
          </GlassButton>
        </div>
      </header>

      <Show when={sizeNote()}>
        <div class="admin-devtools-alert info" role="note">
          {sizeNote()}
        </div>
      </Show>

      <Show when={error()}>
        <div class="admin-devtools-alert" role="alert">
          {error()}
        </div>
      </Show>

      {/* Search + sort */}
      <div class="admin-db-search">
        <GlassCard padding="default">
          <div
            style={{
              display: "flex",
              gap: "var(--sp-3)",
              "align-items": "flex-end",
              "flex-wrap": "wrap"
            }}
          >
            <div style={{ flex: "1", "min-width": "200px" }}>
              <GlassInput
                icon="search"
                placeholder="Filter tables by name…"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
            </div>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-2)"
              }}
            >
              <label
                style={{
                  "font-size": "0.7rem",
                  "font-weight": "600",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.05em",
                  color: "var(--text-secondary)"
                }}
              >
                Sort
              </label>
              <select
                value={sortKey()}
                onChange={(e) =>
                  setSortKey(
                    e.currentTarget.value as "name" | "rows" | "policies"
                  )
                }
                style={{
                  padding: "var(--sp-2) var(--sp-3)",
                  background: "var(--tier-2)",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-md)",
                  color: "var(--text)",
                  "font-size": "0.8125rem"
                }}
              >
                <option value="name">Name (A–Z)</option>
                <option value="rows">Row count (high → low)</option>
                <option value="policies">Policy count (high → low)</option>
              </select>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Tables list */}
      <GlassCard padding="none" class="admin-devtools-card">
        <Show when={loading()}>
          <div class="flex flex-col gap-2 p-4">
            <For each={Array.from({ length: 8 })}>
              {() => (
                <div
                  class="admin-devtools-skeleton"
                  style={{ height: "48px" }}
                />
              )}
            </For>
          </div>
        </Show>

        <Show when={!loading() && filteredTables().length === 0}>
          <div class="p-6">
            <GlassEmptyState
              icon="database"
              title="No tables found"
              message="No tables match your search. Try a different filter."
              surface
            />
          </div>
        </Show>

        <Show when={!loading() && filteredTables().length > 0}>
          <div class="admin-db-tables-scroll">
            <table class="admin-db-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Row Count</th>
                  <th>RLS</th>
                  <th>Policies</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <For each={filteredTables()}>
                  {(t) => {
                    const isExpanded = createMemo(() =>
                      expanded().has(t.name)
                    );
                    const policyData = createMemo(() =>
                      policyCache().get(t.name)
                    );
                    const isLoadingPolicies = createMemo(() =>
                      loadingPolicies().has(t.name)
                    );
                    return (
                      <>
                        <tr
                          onClick={() => toggleExpand(t.name)}
                          classList={{ expanded: isExpanded() }}
                          aria-expanded={isExpanded()}
                        >
                          <td>
                            <div class="table-name-cell">
                              <span
                                class="material-symbols-outlined"
                                aria-hidden="true"
                              >
                                chevron_right
                              </span>
                              {t.name}
                            </div>
                          </td>
                          <td>
                            <span
                              class="admin-db-row-count"
                              classList={{
                                empty: t.row_count === 0 || t.row_count === null
                              }}
                            >
                              {formatRowCount(t.row_count)}
                            </span>
                          </td>
                          <td>
                            <Show
                              when={t.rls_enabled}
                              fallback={
                                <GlassBadge
                                  label="Off"
                                  intent="danger"
                                  size="compact"
                                />
                              }
                            >
                              <GlassBadge
                                label="On"
                                intent="success"
                                size="compact"
                              />
                            </Show>
                          </td>
                          <td>
                            <span
                              style={{
                                "font-variant-numeric": "tabular-nums",
                                "font-weight": "600",
                                color:
                                  t.policy_count === 0
                                    ? "var(--text-muted)"
                                    : "var(--text)"
                              }}
                            >
                              {t.policy_count}
                            </span>
                          </td>
                          <td>
                            <Show
                              when={!t.error}
                              fallback={
                                <GlassBadge
                                  label="Error"
                                  intent="danger"
                                  size="compact"
                                />
                              }
                            >
                              <GlassBadge
                                label="OK"
                                intent="success"
                                size="compact"
                              />
                            </Show>
                          </td>
                        </tr>

                        {/* Expanded policy detail row */}
                        <Show when={isExpanded()}>
                          <tr class="admin-db-policy-detail">
                            <td colspan={5}>
                              <Show
                                when={isLoadingPolicies()}
                                fallback={
                                  <Show
                                    when={policyData()}
                                    fallback={
                                      <div class="admin-db-policy-empty">
                                        No policy data loaded.
                                      </div>
                                    }
                                  >
                                    {(data) => (
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
                                            label={`RLS ${data().rls_enabled ? "Enabled" : "Disabled"}`}
                                            intent={
                                              data().rls_enabled
                                                ? "success"
                                                : "danger"
                                            }
                                            size="compact"
                                          />
                                          <span
                                            style={{
                                              "font-size": "0.7rem",
                                              color: "var(--text-muted)"
                                            }}
                                          >
                                            Source: {data().source}
                                          </span>
                                        </div>
                                        <Show
                                          when={data().policies.length > 0}
                                          fallback={
                                            <div class="admin-db-policy-empty">
                                              No RLS policies documented for
                                              this table.
                                            </div>
                                          }
                                        >
                                          <div class="admin-db-policy-list">
                                            <For each={data().policies}>
                                              {(p) => (
                                                <div class="admin-db-policy-item">
                                                  <div class="admin-db-policy-name">
                                                    <GlassBadge
                                                      label={p.command}
                                                      intent="info"
                                                      size="compact"
                                                    />
                                                    <span>{p.name}</span>
                                                  </div>
                                                  <div
                                                    style={{
                                                      "font-size": "0.7rem",
                                                      color: "var(--text-muted)",
                                                      "margin-top": "2px"
                                                    }}
                                                  >
                                                    Roles:{" "}
                                                    {p.roles.join(", ")}
                                                  </div>
                                                  <Show when={p.using}>
                                                    <div class="admin-db-policy-command">
                                                      USING: {p.using}
                                                    </div>
                                                  </Show>
                                                  <Show when={p.check}>
                                                    <div class="admin-db-policy-command">
                                                      WITH CHECK: {p.check}
                                                    </div>
                                                  </Show>
                                                </div>
                                              )}
                                            </For>
                                          </div>
                                        </Show>
                                      </div>
                                    )}
                                  </Show>
                                }
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    "align-items": "center",
                                    gap: "var(--sp-2)",
                                    padding: "var(--sp-3)",
                                    color: "var(--text-muted)",
                                    "font-size": "0.8125rem"
                                  }}
                                >
                                  <span
                                    class="material-symbols-outlined"
                                    style={{
                                      animation:
                                        "softPulse 1.2s ease-in-out infinite"
                                    }}
                                    aria-hidden="true"
                                  >
                                    progress_activity
                                  </span>
                                  Loading policies…
                                </div>
                              </Show>
                            </td>
                          </tr>
                        </Show>
                      </>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              "border-top": "1px solid var(--hairline)",
              "font-size": "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              "justify-content": "space-between",
              "flex-wrap": "wrap",
              gap: "var(--sp-2)"
            }}
          >
            <span>
              {filteredTables().length} of {tables().length} tables shown
            </span>
            <span>
              Total rows:{" "}
              {tables()
                .reduce((sum, t) => sum + (t.row_count ?? 0), 0)
                .toLocaleString()}
            </span>
          </div>
        </Show>
      </GlassCard>

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

export default AdminDatabasePage;
