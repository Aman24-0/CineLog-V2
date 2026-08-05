// src/features/admin/AdminDashboard.tsx
//
// CineLog V2 — Admin Dashboard Page (Phase 9 Chunk 1 — Glass Redesign)
// ---------------------------------------------------------------------
// At-a-glance overview of the CineLog V2 platform.
//
// LAYOUT:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Header: title + last updated + Refresh button                │
//   ├──────────────────────────────────────────────────────────────┤
//   │ Service Health Strip (7 pills: Supabase / TMDB / MDBList /   │
//   │   AniList / Resend / Vercel / Web Push)                      │
//   │   ← Phase 9 Chunk 2 will wire these to live health checks.   │
//   ├──────────────────────────────────────────────────────────────┤
//   │ Key Metrics (4 GlassStatCards):                              │
//   │   Total Users · Active Watchlist Entries ·                  │
//   │   TMDB Cache Size · API Requests Today                      │
//   ├──────────────────────────────────────────────────────────────┤
//   │ Media Split (DonutChart) — Movies vs TV across all vaults    │
//   ├──────────────────────────────────────────────────────────────┤
//   │ Recent Activity (two columns):                              │
//   │   • Recent User Signups (from /api/admin/users?limit=5)     │
//   │   • Recent Admin Actions (AuditTrailWidget, /api/admin/logs)│
//   └──────────────────────────────────────────────────────────────┘
//
// DATA SOURCES (all real — no hardcoded dummy numbers):
//   • /api/admin/stats  — totals + today's API request count
//   • /api/admin/users  — recent signups (ordered by created_at desc)
//   • /api/admin/logs   — recent admin actions (via AuditTrailWidget)
//
// The page polls /api/admin/stats every 60s and pauses polling when
// the document is hidden (saves up to ~60 calls/hr per hidden tab).
//
// PHASE 9 CHUNK 1 CHANGES (vs. previous AdminDashboard):
//   • Replaced the hand-rolled 10-card grid with 4 GlassStatCards
//     using the unified Glass design system. The previous grid showed
//     several metrics that overlapped with the dedicated Analytics
//     page (Active 7d/30d, Movies vs TV count, Database Size, Server
//     Status) — those are still available on /admin/analytics; the
//     dashboard now shows only the 4 headline metrics the operator
//     needs at a glance.
//   • Added a Service Health Strip (placeholder UI for Chunk 2).
//   • Added a Movies vs TV donut chart using the existing SvgChart
//     primitives (no new chart library).
//   • Added a Recent User Signups panel alongside the existing audit
//     trail widget so the operator can see growth + admin activity
//     side-by-side.
//   • Removed the previous emoji-icon stat cards in favour of
//     Material Symbols (consistent with the Glass system).

import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  type Component,
  For
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { DonutChart } from "~/features/stats/components/SvgChart";
import AuditTrailWidget from "~/features/admin/components/AuditTrailWidget";

// ─── Types ─────────────────────────────────────────────────────

interface AdminStats {
  total_users: number;
  active_users: { h24: number; d7: number; d30: number };
  total_watchlist_entries: number;
  movies_vs_tv: { movies: number; tv_shows: number };
  tmdb_cache: { entries: number; expired: number; size_mb: number | null };
  api_request_count: number;
  /** Phase 9 Chunk 1 — activity_log rows since UTC midnight. */
  api_requests_today: number;
  server_status: "online";
  database_size_mb: number | null;
  fetched_at: string;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  country: string;
  created_at: string;
  deleted_at: string | null;
  admin_disabled_at: string | null;
  scheduled_deletion_at: string | null;
  is_admin: boolean;
  vault_count: number;
  last_activity: string | null;
}

interface ListUsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

// ─── Service Health Strip (placeholder for Phase 9 Chunk 2) ────
//
// Chunk 2 will wire each pill to a real health probe:
//   • Supabase  — ping the /health endpoint or check the database
//                 size query result from /api/admin/stats
//   • TMDB      — probe /configuration with the API key
//   • MDBList   — probe /user/me with the API key
//   • AniList   — probe the GraphQL endpoint with a trivial query
//   • Resend    — probe /domains
//   • Vercel    — probe the deployment status API
//   • Web Push  — check VAPID keys are configured
//
// For Chunk 1 we render the pills as neutral/unknown status so the
// layout is in place. The "info" intent signals "no live data yet"
// without misleading the operator into thinking a service is up/down.

interface ServiceHealthPill {
  name: string;
  icon: string;
  /** Chunk 2 will replace this with "operational" | "degraded" | "down". */
  status: "unknown";
}

const SERVICE_PILLS: ServiceHealthPill[] = [
  { name: "Supabase", icon: "database", status: "unknown" },
  { name: "TMDB", icon: "movie", status: "unknown" },
  { name: "MDBList", icon: "rate_review", status: "unknown" },
  { name: "AniList", icon: "animation", status: "unknown" },
  { name: "Resend", icon: "mail", status: "unknown" },
  { name: "Vercel", icon: "cloud", status: "unknown" },
  { name: "Web Push", icon: "notifications", status: "unknown" }
];

// ─── Helpers ───────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
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

// ─── Recent User Signups sub-component ─────────────────────────
//
// Fetches the 5 most recent signups from /api/admin/users (which
// returns profiles ordered by created_at desc). Rendered alongside
// the AuditTrailWidget in the Recent Activity row.

const RecentUserSignups: Component = () => {
  const [users, setUsers] = createSignal<UserRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const fetchSignups = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        "/api/admin/users?limit=5&page=1",
        { credentials: "include" }
      );
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ListUsersResponse;
      setUsers(data.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchSignups);

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
            person_add
          </span>
          <div>
            <h3 class="m-0 text-sm font-semibold text-text-strong">
              Recent User Signups
            </h3>
            <p class="mt-0.5 text-xs text-text-muted">
              Last 5 new accounts
            </p>
          </div>
        </div>
        <a
          href="/admin/users"
          class="text-xs font-semibold text-primary no-underline hover:underline"
        >
          View all →
        </a>
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

      <Show when={!loading() && !error() && users().length === 0}>
        <div class="px-4 py-6 text-center text-xs text-text-muted">
          No users yet.
        </div>
      </Show>

      <Show when={!loading() && !error() && users().length > 0}>
        <div class="flex flex-col gap-1">
          <For each={users()}>
            {(user) => (
              <div class="flex items-center gap-3 rounded-md bg-tier-2 px-3 py-2 text-xs">
                <div
                  class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-on-primary"
                  aria-hidden="true"
                >
                  {user.display_name.charAt(0).toUpperCase()}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-text-strong">
                    {user.display_name}
                  </div>
                  <div class="truncate text-[11px] text-text-muted">
                    @{user.username}
                  </div>
                </div>
                <span class="flex-shrink-0 font-mono text-[11px] text-text-muted">
                  {relativeTime(user.created_at)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </GlassCard>
  );
};

// ─── AdminDashboard ────────────────────────────────────────────

const AdminDashboard: Component = () => {
  const [stats, setStats] = createSignal<AdminStats | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [lastUpdated, setLastUpdated] = createSignal<Date | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const fetchStats = async () => {
    // Skip polling when the document is hidden (e.g. user switched to
    // another tab or minimized the window). The visibilitychange
    // listener below restarts polling when the tab becomes visible
    // again, so we never miss a refresh — we just avoid wasting API
    // calls while the user isn't looking.
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }
    try {
      const resp = await fetch("/api/admin/stats", {
        credentials: "include",
        headers: { "Content-Type": "application/json" }
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

  // Pause + resume polling on visibility change. When the document
  // becomes hidden we clear the 60s interval; when it becomes visible
  // again we immediately fetch fresh stats + restart the interval.
  // Saves up to ~60 unnecessary /api/admin/stats calls per hour per
  // open-but-hidden admin tab.
  const handleVisibilityChange = () => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    } else {
      if (!pollTimer) {
        void fetchStats();
        pollTimer = setInterval(fetchStats, 60_000);
      }
    }
  };

  onMount(() => {
    void fetchStats();
    pollTimer = setInterval(fetchStats, 60_000); // every 60s
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  // ─── Donut chart data (Movies vs TV across all vaults) ───────
  // Uses the existing <DonutChart> primitive from the Statistics
  // feature. We only render the chart when we have non-zero data so
  // we don't show an empty donut hole on a fresh install.
  const donutSlices = () => {
    const s = stats();
    if (!s) return [];
    const movies = s.movies_vs_tv.movies;
    const tv = s.movies_vs_tv.tv_shows;
    if (movies === 0 && tv === 0) return [];
    return [
      {
        name: "Movies",
        value: movies,
        color: "#f5c518",
        tooltipRows: [
          { name: "Count", value: formatNumber(movies), color: "#f5c518" }
        ]
      },
      {
        name: "TV Shows",
        value: tv,
        color: "#7c8cff",
        tooltipRows: [
          { name: "Count", value: formatNumber(tv), color: "#7c8cff" }
        ]
      }
    ];
  };

  const donutTotal = () => {
    const s = stats();
    if (!s) return 0;
    return s.movies_vs_tv.movies + s.movies_vs_tv.tv_shows;
  };

  return (
    <div class="flex flex-col gap-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="m-0 mb-1 text-2xl font-bold text-text-strong">
            Dashboard
          </h2>
          <p class="m-0 text-sm text-text-muted">
            Real-time overview of CineLog V2 platform metrics
          </p>
        </div>
        <Show when={lastUpdated()}>
          <div class="flex items-center gap-3 text-xs text-text-muted">
            <span>Last updated: {lastUpdated()!.toLocaleTimeString()}</span>
            <Show when={!loading() && !error()}>
              <GlassButton
                variant="glass"
                size="compact"
                icon="refresh"
                onClick={() => {
                  setLoading(true);
                  void fetchStats();
                }}
                aria-label="Refresh stats"
              >
                Refresh
              </GlassButton>
            </Show>
          </div>
        </Show>
      </div>

      {/* ─── Error banner ───────────────────────────────────── */}
      <Show when={error()}>
        <div
          role="alert"
          class="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          <span
            class="material-symbols-outlined text-base"
            aria-hidden="true"
          >
            error
          </span>
          Failed to load stats: {error()}
        </div>
      </Show>

      {/* ─── Service Health Strip ────────────────────────────
          Phase 9 Chunk 2 will replace the "unknown" status with real
          health probe results. For now we render neutral pills so the
          layout is in place and the operator knows which services will
          be monitored. */}
      <GlassCard padding="default">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            monitor_heart
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Service Health
          </h3>
          <span class="ml-auto text-[10px] text-text-muted">
            Live checks coming in Chunk 2
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <For each={SERVICE_PILLS}>
            {(pill) => (
              <div
                class="flex items-center gap-2 rounded-md border border-glass-border bg-tier-2 px-3 py-1.5"
                title={`${pill.name} — status unknown (wiring up in Phase 9 Chunk 2)`}
              >
                <span
                  class="material-symbols-outlined text-sm text-text-soft"
                  aria-hidden="true"
                >
                  {pill.icon}
                </span>
                <span class="text-xs font-medium text-text-secondary">
                  {pill.name}
                </span>
                <GlassBadge
                  intent="default"
                  size="compact"
                  label="—"
                  glass
                />
              </div>
            )}
          </For>
        </div>
      </GlassCard>

      {/* ─── Key Metrics (4 GlassStatCards) ──────────────────
          The 4 metrics required by Phase 9 Chunk 1:
            1. Total Users             — stats.total_users
            2. Active Watchlist Entries — stats.total_watchlist_entries
                                         (already filtered to non-deleted
                                         on the server, so "active" =
                                         "not soft-deleted")
            3. TMDB Cache Size         — stats.tmdb_cache.size_mb (estimated)
            4. API Requests Today      — stats.api_requests_today (UTC day)

          Other metrics returned by /api/admin/stats (active_users 7d/30d,
          movies_vs_tv counts, database size, server status) are
          intentionally NOT shown here — they belong on /admin/analytics
          or are surfaced via the donut chart below. This avoids
          dashboard clutter and the "every card looks the same" problem
          the previous 10-card grid had. */}
      <Show when={loading() && !stats()}>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <For each={Array.from({ length: 4 })}>
            {() => <GlassStatCard value="" label="Loading" loading />}
          </For>
        </div>
      </Show>

      <Show when={stats()}>
        {(s) => (
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <GlassStatCard
              value={formatNumber(s().total_users)}
              label="Total Users"
              icon="group"
              variant="glass"
            />
            <GlassStatCard
              value={formatNumber(s().total_watchlist_entries)}
              label="Active Watchlist"
              icon="bookmark"
              variant="glass"
            />
            <GlassStatCard
              value={
                s().tmdb_cache.size_mb !== null
                  ? `${s().tmdb_cache.size_mb} MB`
                  : "—"
              }
              label="TMDB Cache Size"
              icon="storage"
              variant="glass"
            />
            <GlassStatCard
              value={formatNumber(s().api_requests_today)}
              label="API Requests Today"
              icon="trending_up"
              variant="glass"
            />
          </div>
        )}
      </Show>

      {/* ─── Media Split donut ───────────────────────────────
          Shows the movies vs TV split across ALL user vaults. Uses
          the existing <DonutChart> SvgChart primitive — no new chart
          library. Hidden when both counts are 0 (fresh install). */}
      <Show when={stats() && donutSlices().length > 0}>
        <GlassCard padding="comfortable">
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="material-symbols-outlined text-base text-text-soft"
                aria-hidden="true"
              >
                donut_large
              </span>
              <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
                Media Split — All Vaults
              </h3>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <div class="flex items-center gap-1.5">
                <span
                  class="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#f5c518" }}
                  aria-hidden="true"
                />
                <span class="text-text-secondary">Movies</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span
                  class="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#7c8cff" }}
                  aria-hidden="true"
                />
                <span class="text-text-secondary">TV Shows</span>
              </div>
            </div>
          </div>
          <div class="mx-auto" style={{ "max-width": "320px" }}>
            <DonutChart
              slices={donutSlices()}
              centreValue={formatNumber(donutTotal())}
              centreLabel="Total"
              height={220}
            />
          </div>
        </GlassCard>
      </Show>

      {/* ─── Recent Activity (two columns) ─────────────────── */}
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentUserSignups />
        <AuditTrailWidget />
      </div>
    </div>
  );
};

export default AdminDashboard;
