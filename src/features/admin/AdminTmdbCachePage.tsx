// src/features/admin/AdminTmdbCachePage.tsx
//
// CineLog V2 — Admin TMDB Cache Page
// ---------------------------------------------------------------------
// UI:
//   - Top stats bar: total entries, expired, by media type, oldest/newest, size
//   - Filters: search by TMDB ID, media_type, sort
//   - Paginated list of cache entries
//   - Per-row: delete
//   - Bulk actions: invalidate expired, invalidate all

import { createSignal, Show, For, onMount, createMemo, type Component, type JSX } from "solid-js";

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
  const [sort, setSort] = createSignal<"updated_at" | "expires_at" | "media_type">("updated_at");
  const [toast, setToast] = createSignal<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page()));
      params.set("limit", String(LIMIT));
      if (search()) params.set("search", search());
      if (mediaType() !== "all") params.set("media_type", mediaType());
      params.set("sort", sort());

      const resp = await fetch(`/api/admin/tmdb-cache?${params}`, { credentials: "include" });
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
      const resp = await fetch("/api/admin/tmdb-cache/stats", { credentials: "include" });
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
    fetchEntries();
    fetchStats();
  });

  const applyFilters = () => {
    setPage(1);
    fetchEntries();
  };

  const goToPage = (newPage: number) => {
    setPage(newPage);
    setTimeout(fetchEntries, 0);
  };

  const deleteEntry = async (e: CacheEntry) => {
    if (!confirm(`Delete cache entry for ${e.media_type} #${e.tmdb_id}?`)) return;
    try {
      const resp = await fetch(`/api/admin/tmdb-cache?id=${e.id}`, {
        method: "DELETE",
        credentials: "include",
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
    }
  };

  const invalidateExpired = async () => {
    if (!confirm("Delete ALL expired cache entries? This cannot be undone.")) return;
    try {
      const resp = await fetch("/api/admin/tmdb-cache?action=invalidate-expired", {
        method: "POST",
        credentials: "include",
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast(`Deleted ${body.deleted ?? 0} expired entries`, "success");
      await Promise.all([fetchEntries(), fetchStats()]);
    } catch {
      showToast("Network error", "error");
    }
  };

  const invalidateAll = async () => {
    if (!confirm("WARNING: This will DELETE ALL cache entries. The next user request for each title will hit TMDB. Continue?")) return;
    if (!confirm("Are you absolutely sure? This can cause a temporary spike in TMDB API usage.")) return;
    try {
      const resp = await fetch("/api/admin/tmdb-cache?action=invalidate-all", {
        method: "POST",
        credentials: "include",
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
    }
  };

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

  const statCards = createMemo(() => {
    const s = stats();
    if (!s) return [];
    return [
      { label: "Total Entries", value: s.total.toLocaleString(), icon: "📊", color: "var(--text)" },
      { label: "Expired", value: s.expired.toLocaleString(), icon: "⏰", color: s.expired > 0 ? "rgb(252, 165, 165)" : "var(--text-muted)" },
      { label: "Movies", value: s.by_media_type.movie.toLocaleString(), icon: "🎬", color: "var(--text)" },
      { label: "TV Series", value: s.by_media_type.tv.toLocaleString(), icon: "📺", color: "var(--text)" },
      { label: "Cache Size", value: formatBytes(s.size_bytes), icon: "💾", color: "var(--text)" },
      { label: "Oldest Fetch", value: s.oldest_fetched_at ? formatDate(s.oldest_fetched_at) : "—", icon: "🕚", color: "var(--text-muted)" },
    ];
  });

  return (
    <div>
      <div style={{ "margin-bottom": "var(--sp-6)", display: "flex", "justify-content": "space-between", "align-items": "flex-start", gap: "var(--sp-4)" }}>
        <div>
          <h2 style={{ "font-size": "1.5rem", "font-weight": "700", margin: "0 0 var(--sp-1) 0", color: "var(--text)" }}>
            TMDB Cache
          </h2>
          <p style={{ "font-size": "0.875rem", color: "var(--text-muted)", margin: 0 }}>
            Browse and invalidate cached TMDB metadata. Cached entries reduce TMDB API calls.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <button onClick={invalidateExpired} style={btnSecondary}>
            🗑️ Invalidate Expired
          </button>
          <button onClick={invalidateAll} style={btnDanger}>
            ⚠️ Clear All
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--sp-3)", "margin-bottom": "var(--sp-5)" }}>
        <Show when={!statsLoading()}>
          <For each={statCards()}>
            {(stat) => (
              <div style={statCardStyle}>
                <div style={{ "font-size": "1.25rem", "margin-bottom": "var(--sp-1)" }}>{stat.icon}</div>
                <div style={{ "font-size": "0.7rem", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>
                  {stat.label}
                </div>
                <div style={{ "font-size": "1.1rem", "font-weight": "700", color: stat.color, "margin-top": "2px" }}>
                  {stat.value}
                </div>
              </div>
            )}
          </For>
        </Show>
        <Show when={statsLoading()}>
          <For each={Array.from({ length: 6 })}>
            {() => <div style={{ ...skeletonCard, height: "80px" }} />}
          </For>
        </Show>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, "margin-bottom": "var(--sp-4)", "flex-wrap": "wrap" }}>
        <input
          type="text"
          placeholder="Search by TMDB ID…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          style={{ ...inputStyle, "max-width": "200px" }}
        />
        <select
          value={mediaType()}
          onChange={(e) => {
            setMediaType(e.currentTarget.value as "all" | "movie" | "tv");
            setPage(1);
            setTimeout(fetchEntries, 0);
          }}
          style={{ ...inputStyle, "max-width": "140px" }}
        >
          <option value="all">All types</option>
          <option value="movie">🎬 Movies</option>
          <option value="tv">📺 TV</option>
        </select>
        <select
          value={sort()}
          onChange={(e) => {
            setSort(e.currentTarget.value as "updated_at" | "expires_at" | "media_type");
            setPage(1);
            setTimeout(fetchEntries, 0);
          }}
          style={{ ...inputStyle, "max-width": "180px" }}
        >
          <option value="updated_at">Sort: Recently updated</option>
          <option value="expires_at">Sort: Expires soon</option>
          <option value="media_type">Sort: Media type</option>
        </select>
        <button onClick={applyFilters} style={btnPrimary}>Apply</button>
        <div style={{ "margin-left": "auto", "font-size": "0.8rem", color: "var(--text-muted)" }}>
          {total()} total entries
        </div>
      </div>

      <Show when={error()}>
        <div role="alert" style={alertError}>Failed to load: {error()}</div>
      </Show>

      <Show when={loading()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
          {Array.from({ length: 8 }).map(() => (
            <div style={{ ...skeletonCard, height: "50px" }} />
          ))}
        </div>
      </Show>

      <Show when={!loading() && entries().length === 0}>
        <div style={{ ...cardStyle, "justify-content": "center", color: "var(--text-muted)", "font-size": "0.9rem" }}>
          No cache entries match your filters.
        </div>
      </Show>

      <Show when={!loading() && entries().length > 0}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-1)" }}>
          <For each={entries()}>
            {(e) => (
              <div
                style={{
                  ...cardStyle,
                  padding: "var(--sp-2) var(--sp-3)",
                  "border-color": e.expired ? "rgba(239, 68, 68, 0.3)" : "var(--hairline)",
                }}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)", flex: 1, "min-width": 0 }}>
                  <span style={{ "font-size": "1rem" }}>{e.media_type === "movie" ? "🎬" : "📺"}</span>
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)" }}>
                      <span style={{ "font-weight": "600", color: "var(--text)" }}>
                        TMDB #{e.tmdb_id}
                      </span>
                      <span style={badgeStyle}>{e.media_type}</span>
                      <Show when={e.expired}>
                        <span style={{ ...badgeStyle, color: "rgb(252, 165, 165)", "border-color": "rgba(239, 68, 68, 0.3)" }}>
                          EXPIRED
                        </span>
                      </Show>
                    </div>
                    <div style={{ "font-size": "0.75rem", color: "var(--text-muted)", "margin-top": "2px" }}>
                      Fetched: {formatDate(e.fetched_at)} • Expires: {formatDate(e.expires_at)}
                    </div>
                  </div>
                </div>
                <button onClick={() => deleteEntry(e)} style={iconBtnDanger} title="Delete">🗑️</button>
              </div>
            )}
          </For>
        </div>

        {/* Pagination */}
        <Show when={totalPages() > 1}>
          <div style={{ display: "flex", "justify-content": "center", "align-items": "center", gap: "var(--sp-3)", "margin-top": "var(--sp-5)" }}>
            <button
              onClick={() => goToPage(Math.max(1, page() - 1))}
              disabled={page() === 1}
              style={page() === 1 ? btnDisabled : btnSecondary}
            >
              ← Prev
            </button>
            <span style={{ "font-size": "0.875rem", color: "var(--text-muted)" }}>
              Page {page()} of {totalPages()}
            </span>
            <button
              onClick={() => goToPage(Math.min(totalPages(), page() + 1))}
              disabled={page() === totalPages()}
              style={page() === totalPages() ? btnDisabled : btnSecondary}
            >
              Next →
            </button>
          </div>
        </Show>
      </Show>

      <Show when={toast()}>
        <div style={toastStyle(toast()?.type === "success")}>
          {toast()?.msg}
        </div>
      </Show>
    </div>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const cardStyle: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  padding: "var(--sp-3) var(--sp-4)",
  display: "flex",
  "align-items": "center",
  gap: "var(--sp-3)",
};

const skeletonCard: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  "animation": "pulse 1.5s ease-in-out infinite",
};

const statCardStyle: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  padding: "var(--sp-3) var(--sp-4)",
};

const alertError: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)",
};

const badgeStyle: JSX.CSSProperties = {
  "font-size": "0.65rem",
  "font-weight": "700",
  background: "var(--tier-2)",
  border: "1px solid var(--hairline)",
  padding: "1px 6px",
  "border-radius": "var(--radius-sm)",
  color: "var(--text-muted)",
  "text-transform": "uppercase",
};

const inputStyle: JSX.CSSProperties = {
  background: "var(--tier-2)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-2) var(--sp-3)",
  color: "var(--text)",
  "font-size": "0.875rem",
  "font-family": "inherit",
};

const btnPrimary: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const btnSecondary: JSX.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const btnDanger: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.15)",
  color: "rgb(252, 165, 165)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const btnDisabled: JSX.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "not-allowed",
  opacity: 0.5,
};

const iconBtnDanger: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  width: "32px",
  height: "32px",
  "border-radius": "var(--radius-sm)",
  cursor: "pointer",
  "font-size": "0.9rem",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  "flex-shrink": 0,
};

function toastStyle(success: boolean): JSX.CSSProperties {
  return {
    position: "fixed",
    bottom: "var(--sp-6)",
    right: "var(--sp-6)",
    "z-index": 300,
    background: success ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
    color: "white",
    padding: "var(--sp-3) var(--sp-4)",
    "border-radius": "var(--radius-md)",
    "font-size": "0.875rem",
    "font-weight": "600",
    "box-shadow": "0 10px 25px rgba(0,0,0,0.3)",
  };
}

export default AdminTmdbCachePage;
