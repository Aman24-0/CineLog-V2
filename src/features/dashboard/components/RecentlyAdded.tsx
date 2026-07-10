// src/features/dashboard/components/RecentlyAdded.tsx
import { For, Show, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { toMs } from "~/shared/utils/vaultStatus";
import type { WatchlistItem } from "~/shared/types";

interface RecentlyAddedProps {
  watchlist: WatchlistItem[];
  onOpenMovie: (id: string) => void;
  onNavigate: () => void;
}

/**
 * RecentlyAdded — richer poster rail with context.
 *
 * Each card shows:
 *  - 2:3 poster with hover lift + accent glow
 *  - Status badge (top-left, status-aware color)
 *  - Title (1-line clamp)
 *  - Meta: year + type + "added X ago" timestamp
 *
 * The "added X ago" timestamp makes the rail feel alive — users see
 * not just what was added but when, creating a temporal browsing experience.
 *
 * Cards are 120px on mobile, 140px on desktop. The rail uses scroll-snap
 * for a premium horizontal browsing experience.
 */
const RecentlyAdded: Component<RecentlyAddedProps> = (props) => {
  const recentItems = createMemo(() => props.watchlist.slice(0, 10));

  const timeAgo = (addedAt: unknown): string => {
    const ms = toMs(addedAt);
    if (ms === 0) return "";
    const diff = Date.now() - ms;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const statusLabel = (m: WatchlistItem) => {
    const s = m.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return s || "New";
  };

  const statusClass = (m: WatchlistItem) => {
    const s = m.status;
    if (s === "Plan to Watch" || s === "Planned") return "status-badge-planned";
    if (s === "Watching") return "status-badge-watching";
    if (s === "Completed") return "status-badge-completed";
    return "status-badge-planned";
  };

  const posterUrl = (m: WatchlistItem) =>
    m.poster_path ? tmdbImage(m.poster_path, "w342") : "";

  const year = (m: WatchlistItem) =>
    (m.release_date || m.first_air_date || "").split("-")[0] || "";

  return (
    <Show
      when={props.watchlist.length > 0}
      fallback={
        <div class="empty-premium" style={{ padding: "var(--sp-6)", "text-align": "center" }}>
          <p class="type-body-soft">Nothing added yet. Search for a title to get started.</p>
        </div>
      }
    >
      <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-2" style={{ "scroll-snap-type": "x proximity" }} role="list">
        <For each={recentItems()}>
          {(m) => (
            <div
              class="recent-card"
              role="listitem"
              onClick={() => props.onOpenMovie(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onOpenMovie(m.id);
                }
              }}
              tabindex={0}
              aria-label={`${m.title || m.name}, ${statusLabel(m)}, added ${timeAgo(m.addedAt)}`}
              style={{ "scroll-snap-align": "start" }}
            >
              <div class="recent-card-poster">
                <Show
                  when={posterUrl(m)}
                  fallback={
                    <div
                      class="w-full h-full flex items-center justify-center"
                      style={{ background: "var(--tier-3)" }}
                      aria-hidden="true"
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "28px", color: "var(--text-dim)" }}
                        aria-hidden="true"
                      >
                        movie
                      </span>
                    </div>
                  }
                >
                  <img
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    src={posterUrl(m)}
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => e.currentTarget.classList.add("img-loaded")}
                    alt=""
                    aria-hidden="true"
                  />
                </Show>

                {/* Status badge */}
                <div
                  class={`recent-card-badge tag-chip ${statusClass(m)}`}
                  aria-hidden="true"
                >
                  {statusLabel(m)}
                </div>
              </div>

              <div class="recent-card-info">
                <p class="recent-card-title">{m.title || m.name}</p>
                <p class="recent-card-meta">
                  {year(m) ? `${year(m)} · ` : ""}
                  {m.media_type === "tv" ? "Series" : "Movie"}
                  <Show when={timeAgo(m.addedAt)}>
                    {" · "}{timeAgo(m.addedAt)}
                  </Show>
                </p>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};

export default RecentlyAdded;
