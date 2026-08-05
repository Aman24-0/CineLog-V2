// src/features/admin/AdminDashboard.tsx
//
// CineLog V2 — Admin Dashboard Page (Phase 9 Chunks 1 + 2 — Glass Redesign)
// ---------------------------------------------------------------------
// At-a-glance overview of the CineLog V2 platform.
//
// LAYOUT:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Header: title + last updated + Refresh button                │
//   ├──────────────────────────────────────────────────────────────┤
//   │ Service Health Strip (7 pills: Supabase / TMDB / MDBList /   │
//   │   AniList / Resend / Vercel / Web Push)                      │
//   │   ← Phase 9 Chunk 2 wires these to live health checks via    │
//   │     /api/admin/services/status.                              │
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
//   • /api/admin/stats              — totals + today's API request count
//   • /api/admin/users              — recent signups (ordered by created_at desc)
//   • /api/admin/logs               — recent admin actions (via AuditTrailWidget)
//   • /api/admin/services/status    — live service health (Phase 9 Chunk 2)
//
// The page polls /api/admin/stats AND /api/admin/services/status every
// 60s and pauses polling when the document is hidden (saves up to
// ~120 calls/hr per hidden tab).
//
// PHASE 9 CHUNK 2 CHANGES (vs. Chunk 1's AdminDashboard):
//   • Service Health Strip now fetches live data from
//     /api/admin/services/status. Each pill shows the actual probe
//     status (ok / degraded / down / unknown) with appropriate color
//     coding + latency tooltip.
//   • The strip polls on the same 60s cadence as the stats panel,
//     sharing the visibility-change pause/resume logic so the two
//     polls stay in sync.

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

// ─── Service Health Strip (Phase 9 Chunk 2 — live data) ────────
//
// Each pill is backed by a real probe from /api/admin/services/status.
// The endpoint runs concurrently-bounded checks against each upstream
// (Supabase DB count, TMDB /configuration, MDBList /user/me, AniList
// GraphQL, Resend /domains, Vercel /v6/deployments, Web Push env+DB)
// and returns a single aggregated payload.
//
// Status → intent mapping:
//   • ok       → success (green)
//   • degraded → warning (amber)
//   • down     → danger  (red)
//   • unknown  → default (gray) — e.g. Vercel when no token is set

type ServiceStatus = "ok" | "degraded" | "down" | "unknown";

interface ServiceHealth {
  service: string;
  status: ServiceStatus;
  latency_ms: number | null;
  detail?: string;
}

interface ServicesStatusResponse {
  services: ServiceHealth[];
  fetched_at: string;
}

// Service icon + ordering. The icon matches the one used on the
// corresponding /admin/services/<name> page so the operator can scan
// visually. The order matches the sidebar Services group order for
// the same reason.
const SERVICE_META: Array<{ name: string; icon: string; href: string }> = [
  { name: "Supabase", icon: "database", href: "/admin/services/supabase" },
  { name: "TMDB", icon: "movie", href: "/admin/services/tmdb" },
  { name: "MDBList", icon: "rate_review", href: "/admin/services/mdblist" },
  { name: "AniList", icon: "animation", href: "/admin/services/anilist" },
  { name: "Resend", icon: "mail", href: "/admin/services/resend" },
  { name: "Vercel", icon: "cloud", href: "/admin/services/vercel" },
  { name: "Web Push", icon: "notifications", href: "/admin/services/web-push" }
];

const STATUS_INTENT: Record<
  ServiceStatus,
  "success" | "warning" | "danger" | "default"
> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
  unknown: "default"
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: "OK",
  degraded: "Degraded",
  down: "Down",
  unknown: "—"
};

const STATUS_DOT_CLASS: Record<ServiceStatus, string> = {
  ok: "bg-success",
  degraded: "bg-warning",
  down: "bg-danger",
  unknown: "bg-text-soft"
};

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

  // Service health state (Phase 9 Chunk 2)
  const [services, setServices] = createSignal<ServiceHealth[]>([]);
  const [servicesLoading, setServicesLoading] = createSignal(true);
  const [servicesError, setServicesError] = createSignal<string | null>(null);

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

  // Phase 9 Chunk 2 — service health poller. Shares the visibility
  // gate with the stats poller so the two stay in sync. Pausing on
  // hidden avoids 60 wasted /api/admin/services/status calls per
  // hour per hidden tab.
  const fetchServices = async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const resp = await fetch("/api/admin/services/status", {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ServicesStatusResponse;
      setServices(data.services);
      setServicesError(null);
    } catch (err) {
      setServicesError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setServicesLoading(false);
    }
  };

  // Pause + resume polling on visibility change. When the document
  // becomes hidden we clear the 60s interval; when it becomes visible
  // again we immediately fetch fresh stats + services and restart the
  // interval. Saves up to ~120 unnecessary calls per hour per
  // open-but-hidden admin tab (60 stats + 60 services).
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
        void fetchServices();
        pollTimer = setInterval(() => {
          void fetchStats();
          void fetchServices();
        }, 60_000);
      }
    }
  };

  onMount(() => {
    void fetchStats();
    void fetchServices();
    pollTimer = setInterval(() => {
      void fetchStats();
      void fetchServices();
    }, 60_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  // ─── Service health: order + fill missing rows ──────────────
  // The /api/admin/services/status endpoint returns rows in probe
  // order, but we want the dashboard pills to match the sidebar
  // order (Supabase → TMDB → MDBList → AniList → Resend → Vercel →
  // Web Push). We also fill in any missing rows as "unknown" so the
  // pill count never shrinks below 7 if a probe is added/removed.
  const orderedServices = (): ServiceHealth[] => {
    const list = services();
    const err = servicesError();
    return SERVICE_META.map((meta) => {
      const found = list.find((s) => s.service === meta.name);
      if (found) return found;
      return {
        service: meta.name,
        status: "unknown" as ServiceStatus,
        latency_ms: null,
        // servicesError() is string | null; coerce to string | undefined
        // so the result satisfies ServiceHealth['detail'].
        detail: err ?? undefined
      };
    });
  };

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
                  setServicesLoading(true);
                  void fetchStats();
                  void fetchServices();
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

      {/* ─── Service Health Strip (Phase 9 Chunk 2 — live data) ───
          Each pill is a clickable link to /admin/services/<name>
          so the operator can drill into a degraded service in one
          click. The status dot uses the canonical status color; the
          GlassBadge shows the status label (OK / Degraded / Down / —).
          Latency is shown in the tooltip via the title attribute. */}
      <GlassCard padding="default">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            monitor_heart
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Service Health
          </h3>
          <Show when={servicesLoading() && services().length === 0}>
            <span class="text-[10px] text-text-muted">Loading…</span>
          </Show>
          <Show when={servicesError()}>
            <span class="text-[10px] text-danger">
              Live check failed: {servicesError()}
            </span>
          </Show>
          <span class="ml-auto text-[10px] text-text-muted">
            Polls every 60s · pauses when tab hidden
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          <For each={orderedServices()}>
            {(svc) => {
              const meta = SERVICE_META.find((m) => m.name === svc.service);
              const title = `${svc.service} — ${
                STATUS_LABEL[svc.status]
              }${
                svc.latency_ms !== null ? ` · ${svc.latency_ms}ms` : ""
              }${svc.detail ? ` · ${svc.detail}` : ""}`;
              return (
                <a
                  href={meta?.href ?? "#"}
                  class="flex items-center gap-2 rounded-md border border-glass-border bg-tier-2 px-3 py-2 text-xs no-underline transition-[background-color] hover:bg-glass-strong"
                  title={title}
                  aria-label={title}
                >
                  <span
                    class={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT_CLASS[svc.status]}`}
                    aria-hidden="true"
                  />
                  <span
                    class="material-symbols-outlined text-sm text-text-soft"
                    aria-hidden="true"
                  >
                    {meta?.icon ?? "circle"}
                  </span>
                  <span class="flex-1 truncate font-medium text-text-secondary">
                    {svc.service}
                  </span>
                  <GlassBadge
                    intent={STATUS_INTENT[svc.status]}
                    label={STATUS_LABEL[svc.status]}
                    size="compact"
                    glass
                  />
                </a>
              );
            }}
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
