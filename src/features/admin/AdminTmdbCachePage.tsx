// src/features/admin/AdminTmdbCachePage.tsx
//
// CineLog V2 — Admin Cache Management (Phase 9 Chunk 7 — Glass Redesign)
// ---------------------------------------------------------------------
// Unified cache dashboard for the CineLog metadata providers.
//
// STRUCTURE:
//   1. Cache Providers card — at-a-glance summary of all metadata caches.
//      Currently only TMDB has a DB-backed cache table. AniList and
//      MDBList use ephemeral in-memory caching (no inspectable store),
//      so we surface that fact rather than fabricate stats.
//   2. TMDB Cache stats — six stat cards (total, expired, movies, TV,
//      cache size, oldest fetch).
//   3. Search bar — find specific cache entries by tmdb_id or media_type.
//   4. Paginated entry list with per-row delete.
//   5. Bulk actions: Invalidate Expired, Clear All.
//
// ZERO DUPLICATION:
//   This is the only admin page that touches the tmdb_cache table. The
//   Services Hub TMDB page (/admin/services/tmdb) links here for cache
//   management — it does not duplicate the dashboard.
//
// STRICT USER-SIDE MAPPING:
//   Only TMDB has a DB cache table. AniList and MDBList stats would be
//   fabricated; we instead show "In-memory only — not inspectable" so
//   the admin is not misled. If a future migration adds an AniList or
//   MDBList cache table, this page can be extended to read it.
//
// MOBILE-FIRST:
//   Stat grid: 2 cols (mobile) → 3 (tablet) → 6 (desktop). Entry rows
//   wrap their metadata. Search bar stacks vertically on phone.

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
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";

// ─── Types ──────────────────────────────────────────────────────

interface CacheEntry {
  id: string;
  media_type: "movie" | "tv";
  tmdb_id: number;
  expires_at: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
  expired: boolean;
}

interface CacheStats {
  total: number;
  expired: number;
  by_media_type: { movie: number; tv: number };
  oldest_fetched_at: string | null;
  newest_fetched_at: string | null;
  size_bytes: number;
}

const LIMIT = 25;

// ─── Component ──────────────────────────────────────────────────

const AdminTmdbCachePage: Component = () => {
  const [entries, setEntries] = createSignal<CacheEntry[]>([]);
  const [stats, setStats] = createSignal<CacheStats | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [statsLoading, setStatsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [page, setPage] = createSignal(1);
  const [totalPages, setTotalPages] = createSignal(1);
  const [total, setTotal] = createSignal(0);
  const [search, setSearch] = createSignal("");
  const [mediaType, setMediaType] = createSignal<"all" | "movie" | "tv">("all");
  const [sort, setSort] = createSignal<
    "updated_at" | "expires_at" | "media_type"
  >("updated_at");
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const [actionLoading, setActionLoading] = createSignal<string | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ─── Data fetchers ─────────────────────────────────────────────

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page()));
      params.set("limit", String(LIMIT));
      if (search()) params.set("search", search());
      if (mediaType() !== "all") params.set("media_type", mediaType());
      params.set("sort", sort());

      const resp = await fetch(`/api/admin/tmdb-cache?${params}`, {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as {
        entries: CacheEntry[];
        total: number;
        page: number;
        total_pages: number;
      };
      setEntries(data.entries);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const resp = await fetch("/api/admin/tmdb-cache/stats", {
        credentials: "include"
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as CacheStats;
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  onMount(() => {
    void fetchEntries();
    void fetchStats();
  });

  const applyFilters = () => {
    setPage(1);
    void fetchEntries();
  };

  const goToPage = (newPage: number) => {
    setPage(newPage);
    setTimeout(fetchEntries, 0);
  };

  // ─── Mutations ─────────────────────────────────────────────────

  const deleteEntry = async (e: CacheEntry) => {
    if (!confirm(`Delete cache entry for ${e.media_type} #${e.tmdb_id}?`))
      return;
    setActionLoading(e.id);
    try {
      const resp = await fetch(`/api/admin/tmdb-cache?id=${e.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast("Entry deleted", "success");
      await Promise.all([fetchEntries(), fetchStats()]);
    } catch {
      showToast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const invalidateExpired = async () => {
    if (!confirm("Delete ALL expired cache entries? This cannot be undone."))
      return;
    setActionLoading("invalidate-expired");
    try {
      const resp = await fetch(
        "/api/admin/tmdb-cache?action=invalidate-expired",
        {
          method: "POST",
          credentials: "include"
        }
      );
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast(`Deleted ${body.deleted ?? 0} expired entries`, "success");
      await Promise.all([fetchEntries(), fetchStats()]);
    } catch {
      showToast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const invalidateAll = async () => {
    if (
      !confirm(
        "WARNING: This will DELETE ALL cache entries. The next user request for each title will hit TMDB. Continue?"
      )
    )
      return;
    if (
      !confirm(
        "Are you absolutely sure? This can cause a temporary spike in TMDB API usage."
      )
    )
      return;
    setActionLoading("invalidate-all");
    try {
      const resp = await fetch("/api/admin/tmdb-cache?action=invalidate-all", {
        method: "POST",
        credentials: "include"
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast(`Cleared ${body.deleted ?? 0} entries`, "success");
      await Promise.all([fetchEntries(), fetchStats()]);
    } catch {
      showToast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString();
  };

  // Stat cards (memoized so we don't rebuild on every render)
  const statCards = createMemo(() => {
    const s = stats();
    if (!s) return [];
    return [
      {
        label: "Total Entries",
        value: s.total.toLocaleString(),
        icon: "database",
        danger: false,
        muted: false
      },
      {
        label: "Expired",
        value: s.expired.toLocaleString(),
        icon: "schedule",
        danger: s.expired > 0,
        muted: false
      },
      {
        label: "Movies",
        value: s.by_media_type.movie.toLocaleString(),
        icon: "movie",
        danger: false,
        muted: false
      },
      {
        label: "TV Series",
        value: s.by_media_type.tv.toLocaleString(),
        icon: "tv",
        danger: false,
        muted: false
      },
      {
        label: "Cache Size",
        value: formatBytes(s.size_bytes),
        icon: "save",
        danger: false,
        muted: false
      },
      {
        label: "Oldest Fetch",
        value: s.oldest_fetched_at ? formatDate(s.oldest_fetched_at) : "—",
        icon: "history",
        danger: false,
        muted: true
      }
    ];
  });

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div class="admin-devtools-shell">
      <header class="admin-devtools-header">
        <div>
          <h2>Cache Management</h2>
          <p>
            Inspect and invalidate cached metadata from external providers.
            Cached entries reduce API calls to TMDB, AniList, and MDBList.
          </p>
        </div>
        <div class="admin-devtools-actions">
          <GlassButton
            variant="glass"
            size="compact"
            icon="delete_sweep"
            onClick={invalidateExpired}
            loading={actionLoading() === "invalidate-expired"}
            disabled={actionLoading() !== null}
          >
            Invalidate Expired
          </GlassButton>
          <GlassButton
            variant="danger"
            size="compact"
            icon="warning"
            onClick={invalidateAll}
            loading={actionLoading() === "invalidate-all"}
            disabled={actionLoading() !== null}
          >
            Clear All
          </GlassButton>
        </div>
      </header>

      {/* Cache providers overview */}
      <GlassCard padding="default" class="admin-devtools-card">
        <div class="admin-devtools-card-header">
          <h3>Cache Providers</h3>
        </div>
        <p class="admin-devtools-card-desc">
          Overview of all metadata caches. Only TMDB has a DB-backed cache
          table; AniList and MDBList use ephemeral in-memory caching that
          is not inspectable from the admin panel.
        </p>
        <div class="admin-cache-providers-grid">
          <GlassCard padding="default" variant="glass-strong" class="admin-cache-provider-card">
            <div class="admin-cache-provider-header">
              <span
                class="material-symbols-outlined text-primary"
                style={{
                  "font-variation-settings": "'FILL' 1, 'wght' 400, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                movie
              </span>
              <h4>TMDB</h4>
              <GlassBadge label="DB Cache" intent="success" size="compact" />
            </div>
            <div class="admin-cache-provider-meta">
              Persisted in <code>tmdb_cache</code> table. Browsable below.
              Entries expire based on TMDB's cache-control headers.
            </div>
          </GlassCard>

          <GlassCard padding="default" variant="glass" class="admin-cache-provider-card">
            <div class="admin-cache-provider-header">
              <span
                class="material-symbols-outlined text-text-soft"
                style={{
                  "font-variation-settings": "'FILL' 1, 'wght' 400, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                animation
              </span>
              <h4>AniList</h4>
              <GlassBadge label="In-memory" intent="default" size="compact" />
            </div>
            <div class="admin-cache-provider-meta">
              Ephemeral per-request caching via <code>apiCache.ts</code>. No
              persistent store — not inspectable from the admin panel.
            </div>
          </GlassCard>

          <GlassCard padding="default" variant="glass" class="admin-cache-provider-card">
            <div class="admin-cache-provider-header">
              <span
                class="material-symbols-outlined text-text-soft"
                style={{
                  "font-variation-settings": "'FILL' 1, 'wght' 400, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                rate_review
              </span>
              <h4>MDBList</h4>
              <GlassBadge label="In-memory" intent="default" size="compact" />
            </div>
            <div class="admin-cache-provider-meta">
              Ephemeral per-request caching via <code>apiCache.ts</code>. No
              persistent store — not inspectable from the admin panel.
            </div>
          </GlassCard>
        </div>
      </GlassCard>

      {/* TMDB cache stats */}
      <div class="admin-cache-stats-grid">
        <Show when={!statsLoading()}>
          <For each={statCards()}>
            {(stat) => (
              <GlassCard padding="default" class="admin-cache-stat-card">
                <div class="admin-cache-stat-label">{stat.label}</div>
                <div
                  class="admin-cache-stat-value"
                  classList={{
                    danger: stat.danger,
                    muted: stat.muted
                  }}
                >
                  {stat.value}
                </div>
              </GlassCard>
            )}
          </For>
        </Show>
        <Show when={statsLoading()}>
          <For each={Array.from({ length: 6 })}>
            {() => <GlassSkeleton variant="block" height="80px" />}
          </For>
        </Show>
      </div>

      {/* Search + filters */}
      <GlassCard padding="default" class="admin-devtools-card">
        <div class="admin-filter-bar" style={{ "grid-template-columns": "1fr" }}>
          <div class="admin-filter-field">
            <label for="cache-search">Search by TMDB ID</label>
            <GlassInput
              id="cache-search"
              icon="search"
              placeholder="e.g. 27205"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div class="admin-filter-actions" style={{ "justify-self": "stretch" }}>
            <select
              value={mediaType()}
              onChange={(e) => {
                setMediaType(e.currentTarget.value as "all" | "movie" | "tv");
                setPage(1);
                setTimeout(fetchEntries, 0);
              }}
              style={{
                padding: "var(--sp-2) var(--sp-3)",
                background: "var(--tier-2)",
                border: "1px solid var(--hairline-2)",
                "border-radius": "var(--radius-md)",
                color: "var(--text)",
                "font-size": "0.8125rem"
              }}
            >
              <option value="all">All types</option>
              <option value="movie">Movies</option>
              <option value="tv">TV</option>
            </select>
            <select
              value={sort()}
              onChange={(e) => {
                setSort(
                  e.currentTarget.value as
                    | "updated_at"
                    | "expires_at"
                    | "media_type"
                );
                setPage(1);
                setTimeout(fetchEntries, 0);
              }}
              style={{
                padding: "var(--sp-2) var(--sp-3)",
                background: "var(--tier-2)",
                border: "1px solid var(--hairline-2)",
                "border-radius": "var(--radius-md)",
                color: "var(--text)",
                "font-size": "0.8125rem"
              }}
            >
              <option value="updated_at">Sort: Recently updated</option>
              <option value="expires_at">Sort: Expires soon</option>
              <option value="media_type">Sort: Media type</option>
            </select>
            <GlassButton
              variant="primary"
              size="compact"
              icon="filter_alt"
              onClick={applyFilters}
            >
              Apply
            </GlassButton>
            <span
              style={{
                "margin-left": "auto",
                "font-size": "0.75rem",
                color: "var(--text-muted)"
              }}
            >
              {total().toLocaleString()} total entries
            </span>
          </div>
        </div>
      </GlassCard>

      <Show when={error()}>
        <div class="admin-devtools-alert" role="alert">
          Failed to load: {error()}
        </div>
      </Show>

      {/* Entry list */}
      <GlassCard padding="default" class="admin-devtools-card">
        <Show when={loading()}>
          <GlassLoadingState message="Loading cache entries…" class="!py-8" />
        </Show>

        <Show when={!loading() && entries().length === 0}>
          <GlassEmptyState
            icon="inbox"
            title="No cache entries"
            message="No TMDB cache entries match your filters. Try clearing the search or selecting a different media type."
            surface
          />
        </Show>

        <Show when={!loading() && entries().length > 0}>
          <div class="flex flex-col gap-2">
            <For each={entries()}>
              {(e) => (
                <div
                  class="admin-cache-entry"
                  classList={{ expired: e.expired }}
                >
                  <span
                    class="material-symbols-outlined text-text-soft"
                    style={{ "font-size": "1.25rem", "flex-shrink": "0" }}
                    aria-hidden="true"
                  >
                    {e.media_type === "movie" ? "movie" : "tv"}
                  </span>
                  <div class="admin-cache-entry-body">
                    <div class="admin-cache-entry-title">
                      <strong>TMDB #{e.tmdb_id}</strong>
                      <GlassBadge
                        label={e.media_type}
                        intent="default"
                        size="compact"
                      />
                      <Show when={e.expired}>
                        <GlassBadge
                          label="Expired"
                          intent="danger"
                          size="compact"
                        />
                      </Show>
                    </div>
                    <div class="admin-cache-entry-meta">
                      Fetched: {formatDate(e.fetched_at)} • Expires:{" "}
                      {formatDate(e.expires_at)}
                    </div>
                  </div>
                  <GlassButton
                    variant="glass"
                    size="compact"
                    icon="delete"
                    onClick={() => deleteEntry(e)}
                    loading={actionLoading() === e.id}
                    disabled={actionLoading() !== null}
                    aria-label={`Delete cache entry for ${e.media_type} ${e.tmdb_id}`}
                  />
                </div>
              )}
            </For>
          </div>

          {/* Pagination */}
          <Show when={totalPages() > 1}>
            <div class="admin-pagination">
              <span>
                Page {page()} of {totalPages()}
              </span>
              <div class="admin-pagination-controls">
                <GlassButton
                  variant="glass"
                  size="compact"
                  disabled={page() === 1}
                  onClick={() => goToPage(Math.max(1, page() - 1))}
                >
                  ← Prev
                </GlassButton>
                <GlassButton
                  variant="glass"
                  size="compact"
                  disabled={page() >= totalPages()}
                  onClick={() => goToPage(Math.min(totalPages(), page() + 1))}
                >
                  Next →
                </GlassButton>
              </div>
            </div>
          </Show>
        </Show>
      </GlassCard>

      {/* Toast */}
      <Show when={toast()}>
        <div
          class="admin-devtools-toast"
          classList={{ success: toast()?.type === "success", error: toast()?.type === "error" }}
        >
          {toast()?.msg}
        </div>
      </Show>
    </div>
  );
};

export default AdminTmdbCachePage;
