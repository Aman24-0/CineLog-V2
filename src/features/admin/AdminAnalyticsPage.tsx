// src/features/admin/AdminAnalyticsPage.tsx
//
// CineLog V2 — Admin Analytics Page Component
// ---------------------------------------------------------------------
// Renders the aggregated analytics from the materialized views.
//
// Layout:
//   [Summary cards: total users, vault items, collections, DAU, WAU, MAU, signups]
//   [User growth chart (sparkline) — last 90 days]
//   [Active users chart — DAU/WAU/MAU]
//   [Top titles table — most vaulted in last 30 days]
//   [Content engagement breakdown — by action]
//   [Refresh metadata + manual refresh button]
//
// All data is fetched in a single GET /api/admin/analytics call.

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component,
  type JSX
} from "solid-js";

interface UserGrowthRow {
  day: string;
  new_users: number;
  cumulative_users: number;
}
interface ActiveUsersRow {
  day: string;
  dau: number;
  wau: number;
  mau: number;
}
interface EngagementRow {
  day: string;
  action: string;
  count: number;
  unique_users: number;
}
interface TopTitleRow {
  tmdb_id: number;
  media_type: string;
  vault_count: number;
  completed_count: number;
  planned_count: number;
  watching_count: number;
  unique_users: number;
  avg_rating: number | null;
}
interface Summary {
  total_users: number;
  total_vault_items: number;
  total_collections: number;
  dau_today: number;
  wau_this_week: number;
  mau_this_month: number;
  new_users_30d: number;
  new_users_7d: number;
  new_users_24h: number;
}
interface AnalyticsResponse {
  user_growth: UserGrowthRow[];
  active_users: ActiveUsersRow[];
  content_engagement: EngagementRow[];
  top_titles: TopTitleRow[];
  summary: Summary;
  last_refresh: string | null;
  next_refresh_eta_minutes: number;
  fetched_at: string;
}

const AdminAnalyticsPage: Component = () => {
  const [data, setData] = createSignal<AnalyticsResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/analytics", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as AnalyticsResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchAnalytics);

  // ─── Derived data ──────────────────────────────────────────
  const engagementByAction = createMemo(() => {
    const rows = data()?.content_engagement ?? [];
    const map = new Map<string, { count: number; users: number }>();
    for (const r of rows) {
      const cur = map.get(r.action) ?? { count: 0, users: 0 };
      cur.count += r.count;
      cur.users = Math.max(cur.users, r.unique_users);
      map.set(r.action, cur);
    }
    return Array.from(map.entries())
      .map(([action, v]) => ({ action, ...v }))
      .sort((a, b) => b.count - a.count);
  });

  // Sparkline points (max 90 days)
  const growthSparkline = createMemo(() => {
    const rows = data()?.user_growth ?? [];
    if (rows.length === 0) return "";
    const max = Math.max(...rows.map((r) => r.new_users), 1);
    return rows
      .map((r, i) => {
        const x = (i / Math.max(rows.length - 1, 1)) * 100;
        const y = 30 - (r.new_users / max) * 28;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  });

  // ─── Helpers ───────────────────────────────────────────────
  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const actionLabel = (raw: string) => raw.replace(/_/g, " ");

  // ─── Render ────────────────────────────────────────────────
  return (
    <div class="admin-analytics-page" style={{ padding: "var(--sp-6)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "var(--sp-6)",
          "flex-wrap": "wrap",
          gap: "var(--sp-3)"
        }}
      >
        <div>
          <h1
            style={{ margin: 0, "font-size": "1.75rem", color: "var(--text)" }}
          >
            Analytics
          </h1>
          <p
            style={{
              margin: "var(--sp-1) 0 0 0",
              color: "var(--text-muted)",
              "font-size": "0.875rem"
            }}
          >
            Aggregated engagement metrics, refreshed hourly by pg_cron.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAnalytics}
          disabled={loading()}
          style={btnStyle(loading())}
        >
          {loading() ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Refresh metadata */}
      <Show when={data()}>
        <div style={metaBarStyle}>
          <span>
            <strong>Last refresh:</strong> {formatDate(data()!.last_refresh)}
          </span>
          <span>
            <strong>Next refresh:</strong> ~{data()!.next_refresh_eta_minutes}{" "}
            min
          </span>
          <span>
            <strong>Page fetched:</strong> {formatDate(data()!.fetched_at)}
          </span>
        </div>
      </Show>

      <Show when={error()}>
        <div style={errorStyle}>{error()}</div>
      </Show>

      <Show when={loading() && !data()} fallback={null}>
        <div style={loadingStyle}>Loading analytics…</div>
      </Show>

      <Show when={data()}>
        {/* ─── Summary cards ─────────────────────────────── */}
        <div style={cardsGridStyle}>
          <StatCard
            label="Total users"
            value={data()!.summary.total_users}
            hint="non-deleted profiles"
          />
          <StatCard
            label="New users (24h)"
            value={data()!.summary.new_users_24h}
            hint={`last 7 days: ${data()!.summary.new_users_7d}`}
          />
          <StatCard
            label="New users (30d)"
            value={data()!.summary.new_users_30d}
            hint={`last 24h: ${data()!.summary.new_users_24h}`}
          />
          <StatCard
            label="DAU today"
            value={data()!.summary.dau_today}
            hint="active users today"
          />
          <StatCard
            label="WAU (7d)"
            value={data()!.summary.wau_this_week}
            hint="active in last 7 days"
          />
          <StatCard
            label="MAU (30d)"
            value={data()!.summary.mau_this_month}
            hint="active in last 30 days"
          />
          <StatCard
            label="Vault items"
            value={data()!.summary.total_vault_items}
            hint="non-deleted rows"
          />
          <StatCard
            label="Collections"
            value={data()!.summary.total_collections}
            hint="user + curated"
          />
        </div>

        {/* ─── User growth sparkline ─────────────────────── */}
        <Section title="User growth (last 90 days)">
          <Show
            when={data()!.user_growth.length > 0}
            fallback={<EmptyState label="No data yet" />}
          >
            <svg
              viewBox="0 0 100 30"
              preserveAspectRatio="none"
              style={sparklineStyle}
            >
              <polyline
                points={growthSparkline()}
                fill="none"
                stroke="var(--p)"
                stroke-width="0.6"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <div
              style={{
                "margin-top": "var(--sp-3)",
                "font-size": "0.8125rem",
                color: "var(--text-muted)"
              }}
            >
              {data()!.user_growth.length} days tracked • peak day:{" "}
              {Math.max(...data()!.user_growth.map((r) => r.new_users))} new
              users
            </div>
          </Show>
        </Section>

        {/* ─── Top titles ─────────────────────────────────── */}
        <Section title="Top titles (last 30 days)">
          <Show
            when={data()!.top_titles.length > 0}
            fallback={<EmptyState label="No vault activity yet" />}
          >
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>TMDB ID</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Vaults</th>
                    <th style={thStyle}>Completed</th>
                    <th style={thStyle}>Watching</th>
                    <th style={thStyle}>Planned</th>
                    <th style={thStyle}>Unique users</th>
                    <th style={thStyle}>Avg rating</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={data()!.top_titles.slice(0, 20)}>
                    {(row, i) => (
                      <tr>
                        <td style={tdStyle}>{i() + 1}</td>
                        <td style={tdStyle}>
                          <a
                            href={`https://www.themoviedb.org/${row.media_type}/${row.tmdb_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--p)",
                              "text-decoration": "none"
                            }}
                          >
                            {row.tmdb_id}
                          </a>
                        </td>
                        <td style={tdStyle}>
                          {row.media_type === "tv" ? "TV" : "Movie"}
                        </td>
                        <td style={tdStyle}>{row.vault_count}</td>
                        <td style={tdStyle}>{row.completed_count}</td>
                        <td style={tdStyle}>{row.watching_count}</td>
                        <td style={tdStyle}>{row.planned_count}</td>
                        <td style={tdStyle}>{row.unique_users}</td>
                        <td style={tdStyle}>
                          {row.avg_rating !== null
                            ? row.avg_rating.toFixed(1)
                            : "—"}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Section>

        {/* ─── Content engagement breakdown ───────────────── */}
        <Section title="Content engagement (last 90 days, by action)">
          <Show
            when={engagementByAction().length > 0}
            fallback={<EmptyState label="No activity_log entries in range" />}
          >
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Total events</th>
                    <th style={thStyle}>Peak unique users / day</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={engagementByAction()}>
                    {(row) => (
                      <tr>
                        <td style={tdStyle}>
                          <code style={codeStyle}>
                            {actionLabel(row.action)}
                          </code>
                        </td>
                        <td style={tdStyle}>{row.count.toLocaleString()}</td>
                        <td style={tdStyle}>{row.users.toLocaleString()}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Section>
      </Show>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────

const StatCard: Component<{ label: string; value: number; hint?: string }> = (
  props
) => (
  <div style={statCardStyle}>
    <div
      style={{
        "font-size": "0.75rem",
        color: "var(--text-muted)",
        "text-transform": "uppercase",
        "letter-spacing": "0.05em"
      }}
    >
      {props.label}
    </div>
    <div
      style={{
        "font-size": "1.75rem",
        "font-weight": "700",
        color: "var(--text)",
        margin: "var(--sp-1) 0"
      }}
    >
      {props.value.toLocaleString()}
    </div>
    <Show when={props.hint}>
      <div style={{ "font-size": "0.75rem", color: "var(--text-muted)" }}>
        {props.hint}
      </div>
    </Show>
  </div>
);

const Section: Component<{ title: string; children: JSX.Element }> = (
  props
) => (
  <section style={{ "margin-top": "var(--sp-8)" }}>
    <h2
      style={{
        "font-size": "1.125rem",
        color: "var(--text)",
        margin: "0 0 var(--sp-4) 0"
      }}
    >
      {props.title}
    </h2>
    {props.children}
  </section>
);

const EmptyState: Component<{ label: string }> = (props) => (
  <div
    style={{
      padding: "var(--sp-8)",
      "text-align": "center",
      color: "var(--text-muted)",
      "font-size": "0.875rem",
      background: "var(--tier-1)",
      border: "1px dashed var(--hairline-2)",
      "border-radius": "var(--radius-md)"
    }}
  >
    {props.label}
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────

const cardsGridStyle = {
  display: "grid",
  "grid-template-columns": "repeat(auto-fill, minmax(180px, 1fr))",
  gap: "var(--sp-3)",
  "margin-bottom": "var(--sp-6)"
} as const;

const statCardStyle = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)"
} as const;

const sparklineStyle = {
  width: "100%",
  height: "120px",
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-3)"
} as const;

const tableWrapStyle = {
  "overflow-x": "auto",
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)"
} as const;

const tableStyle = {
  width: "100%",
  "border-collapse": "collapse",
  "font-size": "0.8125rem"
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
  "white-space": "nowrap" as const
};

const tdStyle = {
  padding: "var(--sp-3)",
  "border-bottom": "1px solid var(--hairline)",
  color: "var(--text)",
  "white-space": "nowrap" as const
};

const codeStyle = {
  background: "var(--tier-2)",
  padding: "0.125rem 0.375rem",
  "border-radius": "var(--radius-sm)",
  "font-size": "0.75rem",
  color: "var(--text-secondary)"
} as const;

const metaBarStyle = {
  display: "flex",
  "flex-wrap": "wrap" as const,
  gap: "var(--sp-4)",
  padding: "var(--sp-3) var(--sp-4)",
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  "margin-bottom": "var(--sp-6)",
  "font-size": "0.8125rem",
  color: "var(--text-secondary)"
} as const;

const errorStyle = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-3) var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  color: "rgb(252, 165, 165)",
  "font-size": "0.875rem"
} as const;

const loadingStyle = {
  padding: "var(--sp-8)",
  "text-align": "center",
  color: "var(--text-muted)",
  "font-size": "0.875rem"
} as const;

function btnStyle(disabled: boolean) {
  return {
    padding: "var(--sp-2) var(--sp-4)",
    background: disabled ? "var(--tier-3)" : "var(--p)",
    color: disabled ? "var(--text-muted)" : "var(--on-primary)",
    border: "none",
    "border-radius": "var(--radius-md)",
    "font-size": "0.8125rem",
    "font-weight": "600",
    cursor: disabled ? "not-allowed" : "pointer"
  } as const;
}

export default AdminAnalyticsPage;
