// src/features/admin/AdminDashboard.tsx
//
// CineLog V2 — Admin Dashboard Page
// ---------------------------------------------------------------------
// Displays 8 high-level metrics for the CineLog V2 application.
//
// LAYOUT:
//   ┌──────────────────────┬──────────────────────┐
//   │ Total Users          │ Active Users (24h)   │
//   ├──────────────────────┼──────────────────────┤
//   │ Active Users (7d)    │ Active Users (30d)   │
//   ├──────────────────────┼──────────────────────┤
//   │ Watchlist Entries    │ Movies vs TV         │
//   ├──────────────────────┼──────────────────────┤
//   │ TMDB Cache           │ Server Status        │
//   ├──────────────────────┼──────────────────────┤
//   │ API Requests         │ Database Size        │
//   └──────────────────────┴──────────────────────┘
//
// All metrics are fetched from /api/admin/stats in a single request.
// The page polls every 60 seconds to keep metrics fresh.

import { createSignal, onMount, onCleanup, Show, type Component } from "solid-js";

interface AdminStats {
  total_users: number;
  active_users: { h24: number; d7: number; d30: number };
  total_watchlist_entries: number;
  movies_vs_tv: { movies: number; tv_shows: number };
  tmdb_cache: { entries: number; expired: number; size_mb: number | null };
  api_request_count: number;
  server_status: "online";
  database_size_mb: number | null;
  fetched_at: string;
}

interface StatCard {
  label: string;
  value: string;
  subtitle?: string;
  icon: string;
  accent?: "default" | "success" | "warning" | "danger";
}

const AdminDashboard: Component = () => {
  const [stats, setStats] = createSignal<AdminStats | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [lastUpdated, setLastUpdated] = createSignal<Date | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const fetchStats = async () => {
    try {
      const resp = await fetch("/api/admin/stats", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as AdminStats;
      setStats(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void fetchStats();
    pollTimer = setInterval(fetchStats, 60_000); // every 60s
  });

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  const formatNumber = (n: number): string => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  };

  const cards = (): StatCard[] => {
    const s = stats();
    if (!s) return [];
    return [
      {
        label: "Total Users",
        value: formatNumber(s.total_users),
        subtitle: "Registered accounts",
        icon: "👥",
      },
      {
        label: "Active (24h)",
        value: formatNumber(s.active_users.h24),
        subtitle: "Users active in last 24 hours",
        icon: "⚡",
        accent: "success",
      },
      {
        label: "Active (7d)",
        value: formatNumber(s.active_users.d7),
        subtitle: "Users active in last 7 days",
        icon: "📅",
      },
      {
        label: "Active (30d)",
        value: formatNumber(s.active_users.d30),
        subtitle: "Users active in last 30 days",
        icon: "📆",
      },
      {
        label: "Watchlist Entries",
        value: formatNumber(s.total_watchlist_entries),
        subtitle: "Total items across all users",
        icon: "🎬",
      },
      {
        label: "Movies vs TV",
        value: `${formatNumber(s.movies_vs_tv.movies)} / ${formatNumber(s.movies_vs_tv.tv_shows)}`,
        subtitle: `${formatNumber(
          s.movies_vs_tv.movies + s.movies_vs_tv.tv_shows,
        )} total — split by media type`,
        icon: "📺",
      },
      {
        label: "TMDB Cache",
        value: formatNumber(s.tmdb_cache.entries),
        subtitle:
          s.tmdb_cache.size_mb !== null
            ? `~${s.tmdb_cache.size_mb} MB · ${s.tmdb_cache.expired} expired`
            : `${s.tmdb_cache.expired} expired entries`,
        icon: "🗄️",
        accent: s.tmdb_cache.expired > 0 ? "warning" : "default",
      },
      {
        label: "Server Status",
        value: s.server_status === "online" ? "Online" : "Offline",
        subtitle: "Supabase API reachable",
        icon: "🟢",
        accent: "success",
      },
      {
        label: "API Requests",
        value: formatNumber(s.api_request_count),
        subtitle: "Total logged activities (all-time)",
        icon: "📈",
      },
      {
        label: "Database Size",
        value: s.database_size_mb !== null ? `${s.database_size_mb} MB` : "—",
        subtitle: s.database_size_mb !== null ? "Supabase Postgres" : "Requires access token",
        icon: "💾",
      },
    ];
  };

  return (
    <div>
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
          <h2
            style={{
              "font-size": "1.5rem",
              "font-weight": "700",
              margin: "0 0 var(--sp-1) 0",
              color: "var(--text)",
            }}
          >
            Dashboard
          </h2>
          <p
            style={{
              "font-size": "0.875rem",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            Real-time overview of CineLog V2 platform metrics
          </p>
        </div>
        <Show when={lastUpdated()}>
          <div
            style={{
              "font-size": "0.75rem",
              color: "var(--text-muted)",
              "text-align": "right",
            }}
          >
            Last updated: {lastUpdated()!.toLocaleTimeString()}
            <Show when={!loading() && !error()}>
              <button
                onClick={() => {
                  setLoading(true);
                  void fetchStats();
                }}
                style={{
                  "margin-left": "var(--sp-3)",
                  "background": "transparent",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-sm)",
                  padding: "2px 8px",
                  "font-size": "0.75rem",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                ↻ Refresh
              </button>
            </Show>
          </div>
        </Show>
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
          Failed to load stats: {error()}
        </div>
      </Show>

      <Show when={loading() && !stats()}>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "var(--sp-4)",
          }}
        >
          {Array.from({ length: 10 }).map(() => (
            <div
              style={{
                "background": "var(--tier-1)",
                border: "1px solid var(--hairline)",
                "border-radius": "var(--radius-lg)",
                padding: "var(--sp-5)",
                height: "120px",
                "animation": "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      </Show>

      <Show when={stats()}>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "var(--sp-4)",
          }}
        >
          {cards().map((card) => (
            <div
              style={{
                "background": "var(--tier-1)",
                border: "1px solid var(--hairline)",
                "border-radius": "var(--radius-lg)",
                padding: "var(--sp-5)",
                "transition": "border-color 0.15s ease, transform 0.15s ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--p)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--hairline)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  "margin-bottom": "var(--sp-3)",
                }}
              >
                <span style={{ "font-size": "1.5rem", "line-height": 1 }}>{card.icon}</span>
                <Show when={card.accent === "success"}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      "border-radius": "50%",
                      "background": "rgb(34, 197, 94)",
                      "box-shadow": "0 0 8px rgba(34, 197, 94, 0.6)",
                    }}
                  />
                </Show>
                <Show when={card.accent === "warning"}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      "border-radius": "50%",
                      "background": "rgb(251, 191, 36)",
                      "box-shadow": "0 0 8px rgba(251, 191, 36, 0.6)",
                    }}
                  />
                </Show>
              </div>
              <div
                style={{
                  "font-size": "1.75rem",
                  "font-weight": "700",
                  color: "var(--text)",
                  "line-height": 1.2,
                  "margin-bottom": "var(--sp-1)",
                }}
              >
                {card.value}
              </div>
              <div
                style={{
                  "font-size": "0.8125rem",
                  "font-weight": "500",
                  color: "var(--text-secondary)",
                  "margin-bottom": "var(--sp-1)",
                }}
              >
                {card.label}
              </div>
              <Show when={card.subtitle}>
                <div
                  style={{
                    "font-size": "0.75rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {card.subtitle}
                </div>
              </Show>
            </div>
          ))}
        </div>
      </Show>
    </div>
  );
};

export default AdminDashboard;
