// src/features/watchlist/components/VaultCard.tsx
import { Show, createMemo, type JSX } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { getEpisodeProgress } from "~/shared/utils/progress";
import type { WatchlistItem } from "~/shared/types";
import { GlassCard } from "~/shared/ui/glass";

// ─── Module-level style constants ────────────────────────────────────
// VaultCard is rendered for every row in the Timeline view (potentially
// 100+ rows). Extracting these static styles keeps mount allocations
// to a minimum.
const POSTER_THUMB_STYLE: JSX.CSSProperties = {
  // Phase 14 Chunk 5 fix — use glass-bg so the poster thumbnail's
  // letterbox area (visible when the poster fails to load or while
  // loading) blends with the ambient field instead of reading as a
  // solid black slab.
  background: "var(--glass-bg)",
  "box-shadow": "var(--shadow-premium)"
};
const POSTER_FALLBACK_ICON_STYLE: JSX.CSSProperties = {
  color: "var(--text-dim)",
  "font-size": "20px"
};
const PROGRESS_TRACK_STYLE: JSX.CSSProperties = {
  background: "rgba(255,255,255,0.20)"
};
const PROGRESS_FILL_BASE_STYLE: JSX.CSSProperties = {
  background: "var(--p, #e8b74a)",
  transition: "width 400ms ease-out"
};
const SELECTION_BASE_STYLE: JSX.CSSProperties = {
  width: "24px",
  height: "24px"
};
const SELECTION_SELECTED_STYLE: JSX.CSSProperties = {
  ...SELECTION_BASE_STYLE,
  background: "var(--p)",
  border: "none"
};
const SELECTION_UNSELECTED_STYLE: JSX.CSSProperties = {
  ...SELECTION_BASE_STYLE,
  background: "rgba(0,0,0,0.5)",
  border: "2px solid rgba(255,255,255,0.3)"
};
const CHECK_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "14px",
  color: "var(--on-primary, #0a0a0a)"
};
const TITLE_TEXT_STYLE: JSX.CSSProperties = {
  "font-size": "0.875rem",
  "font-weight": 700,
  margin: 0
};
const MEDIA_TYPE_BADGE_STYLE: JSX.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-soft)",
  padding: "2px 6px",
  "border-radius": "4px",
  "font-size": "0.5rem",
  border: "1px solid var(--hairline)"
};
const YEAR_META_STYLE: JSX.CSSProperties = {
  "font-size": "0.5rem",
  color: "var(--text-muted)"
};
const RUNTIME_META_STYLE: JSX.CSSProperties = {
  "font-size": "0.5rem",
  color: "var(--text-muted)"
};
const IMDB_RATING_STYLE: JSX.CSSProperties = {
  "font-size": "0.5625rem",
  color: "#f5c518"
};
const IMDB_STAR_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "10px",
  color: "#f5c518"
};
const USER_RATING_STYLE: JSX.CSSProperties = {
  "font-size": "0.5625rem",
  color: "var(--p)"
};
const USER_RATING_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "10px",
  color: "var(--p)"
};
const COMPLETED_BADGE_STYLE: JSX.CSSProperties = {
  "font-size": "0.5rem",
  color: "#60a5fa",
  background: "rgba(96,165,250,0.08)",
  border: "1px solid rgba(96,165,250,0.25)",
  padding: "2px 6px",
  "border-radius": "var(--radius-pill)"
};
const COMPLETED_ICON_STYLE: JSX.CSSProperties = { "font-size": "10px" };
const EPISODE_TEXT_STYLE: JSX.CSSProperties = { "font-size": "0.5625rem" };
const EPISODE_LABEL_STYLE: JSX.CSSProperties = {
  color: "var(--p)",
  "font-weight": 600
};
const EPISODE_DOT_STYLE: JSX.CSSProperties = { color: "var(--text-dim)" };
const EPISODE_FRACTION_STYLE: JSX.CSSProperties = {
  color: "var(--text-muted)"
};
const CHEVRON_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "24px",
  color: "var(--p)"
};

interface VaultCardProps {
  item: WatchlistItem;
  date: Date | null;
  onOpenMovie: (id: string) => void;
  /**
   * SELECTION MODE (future batch management) — when true, the card shows
   * a checkbox overlay. Default: false.
   */
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

/**
 * VaultCard — used in the Timeline view.
 *
 * POLISHED TIMELINE (v2):
 *  - Removed the individual floating day bubble (wasted horizontal space).
 *    The Month/Year group header now carries the date context.
 *  - Horizontal layout: [poster] [info cluster] [chevron]
 *  - TV shows with status "Watching" show episode progress text +
 *    a thin progress bar at the bottom edge of the poster thumbnail.
 *  - Selection mode prep: accepts isSelectionMode prop for future
 *    batch management.
 *
 * The card is self-contained — no dependency on parent context beyond props.
 */
export default function VaultCard(props: VaultCardProps) {
  const title = () => props.item.title || props.item.name || "Untitled";
  const year = () =>
    (props.item.release_date || props.item.first_air_date || "").split(
      "-"
    )[0] || "";

  const statusLabel = () => {
    const s = props.item.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return s || "New";
  };

  const posterUrl = () =>
    props.item.poster_path ? tmdbImage(props.item.poster_path, "w185") : "";

  // TV episode progress — for TV shows with status "Watching"
  const episodeProgress = () => {
    if (props.item.media_type !== "tv") return null;
    if (props.item.status !== "Watching") return null;
    return getEpisodeProgress(props.item);
  };

  // Memoized reactive styles — depend on signals so they need to
  // re-create when their inputs change, but createMemo gives them a
  // stable identity between unrelated reactive updates.
  const progressFillStyle = createMemo(() => ({
    ...PROGRESS_FILL_BASE_STYLE,
    width: `${episodeProgress()?.pct ?? 0}%`
  }));
  const selectionStyle = createMemo(() =>
    props.isSelected ? SELECTION_SELECTED_STYLE : SELECTION_UNSELECTED_STYLE
  );

  return (
    <div
      class="animate-timeline-in group relative flex cursor-pointer items-center pl-3 pr-3"
      onClick={() => {
        if (props.isSelectionMode) {
          props.onToggleSelect?.();
        } else {
          props.onOpenMovie(props.item.id);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (props.isSelectionMode) {
            props.onToggleSelect?.();
          } else {
            props.onOpenMovie(props.item.id);
          }
        }
      }}
      role="article"
      tabindex={0}
      aria-label={`${title()}, ${props.date ? props.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "date unknown"}`}
    >
      {/* EXACT WATCH DATE — restored per v3 spec.
          Subtle glass pill positioned to the left of the poster, vertically
          centered. Shows e.g. "21 Jul" so users can see the exact watch date
          per card (the Month/Year group header still carries the broader
          date context). Hidden when there's no date (avoids empty pill). */}
      <Show when={props.date}>
        <div
          class="timeline-day-pill flex shrink-0 flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span class="timeline-day-num">
            {props.date!.toLocaleDateString("en-US", { day: "numeric" })}
          </span>
          <span class="timeline-day-mon">
            {props.date!.toLocaleDateString("en-US", { month: "short" })}
          </span>
        </div>
      </Show>

      {/* Timeline card body */}
      <GlassCard
        variant="glass"
        class="timeline-card flex w-full items-center gap-3 rounded-[1.5rem] p-3"
        interactive
      >
        {/* Poster thumbnail with progress bar */}
        <div
          class="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-16"
          style={POSTER_THUMB_STYLE}
        >
          <Show
            when={posterUrl()}
            fallback={
              <div
                class="absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <Icon name="movie" style={POSTER_FALLBACK_ICON_STYLE} />
              </div>
            }
          >
            <div class="poster-loading" aria-hidden="true" />
            <img
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              src={posterUrl()}
              class="poster-img absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onLoad={(e) => {
                e.currentTarget.classList.add("img-loaded");
                e.currentTarget.previousElementSibling?.classList.add("hidden");
              }}
              alt=""
              aria-hidden="true"
            />
          </Show>

          {/* TV Episode Progress Bar — thin bar at the bottom edge of
              the poster thumbnail, ONLY for TV shows with status "Watching". */}
          <Show when={episodeProgress()}>
            <div
              class="absolute bottom-0 left-0 h-1 w-full"
              style={PROGRESS_TRACK_STYLE}
              aria-hidden="true"
            >
              <div class="h-full" style={progressFillStyle()} />
            </div>
          </Show>

          {/* Selection mode checkbox overlay */}
          <Show when={props.isSelectionMode}>
            <div
              class="absolute right-1 top-1 z-[4] flex items-center justify-center rounded-full"
              style={selectionStyle()}
              aria-hidden="true"
            >
              <Show when={props.isSelected}>
                <span
                  class="material-symbols-outlined"
                  style={CHECK_ICON_STYLE}
                >
                  check
                </span>
              </Show>
            </div>
          </Show>
        </div>

        {/* Info cluster */}
        <div class="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1">
          <p
            class="type-headline truncate text-white group-hover:text-white"
            style={TITLE_TEXT_STYLE}
          >
            {title()}
          </p>

          <div class="flex flex-wrap items-center gap-1.5">
            <span class="type-meta shrink-0" style={MEDIA_TYPE_BADGE_STYLE}>
              {props.item.media_type === "tv" ? "Series" : "Movie"}
            </span>
            <Show when={year()}>
              <span class="type-meta shrink-0" style={YEAR_META_STYLE}>
                {year()}
              </span>
            </Show>
            <Show when={props.item.runtime && props.item.runtime > 0}>
              <span class="type-meta shrink-0" style={RUNTIME_META_STYLE}>
                · {formatRuntime(props.item.runtime)}
              </span>
            </Show>
          </div>

          {/* TV episode progress text (for watching TV shows) OR rating row */}
          <Show
            when={episodeProgress()}
            fallback={
              <div class="flex flex-wrap items-center gap-2">
                <Show when={props.item.imdbRating}>
                  <span
                    class="type-meta inline-flex items-center gap-1"
                    style={IMDB_RATING_STYLE}
                  >
                    <Icon
                      name="star"
                      fill
                      style={IMDB_STAR_ICON_STYLE}
                      aria-hidden="true"
                    />
                    {props.item.imdbRating}
                  </span>
                </Show>
                <Show when={props.item.rating}>
                  <span
                    class="type-meta inline-flex items-center gap-1"
                    style={USER_RATING_STYLE}
                  >
                    <Icon
                      name="person"
                      fill
                      style={USER_RATING_ICON_STYLE}
                      aria-hidden="true"
                    />
                    {props.item.rating}/10
                  </span>
                </Show>
                <Show when={props.item.status === "Completed"}>
                  <span
                    class="type-meta inline-flex shrink-0 items-center gap-1"
                    style={COMPLETED_BADGE_STYLE}
                  >
                    <Icon
                      name="task_alt"
                      style={COMPLETED_ICON_STYLE}
                      aria-hidden="true"
                    />
                    {statusLabel()}
                  </span>
                </Show>
              </div>
            }
          >
            {/* TV episode progress text: S{season} E{episode} • {watched}/{total} Eps
                When totalEps is 0 (no season data), show ONLY S{season} E{episode}. */}
            <div
              class="type-meta flex items-center gap-1.5"
              style={EPISODE_TEXT_STYLE}
            >
              <span style={EPISODE_LABEL_STYLE}>
                S{episodeProgress()!.season} E{episodeProgress()!.episode}
              </span>
              <Show when={episodeProgress()!.seriesTotalEps > 0}>
                <span style={EPISODE_DOT_STYLE}>·</span>
                <span style={EPISODE_FRACTION_STYLE}>
                  {episodeProgress()!.seriesCompletedEps}/
                  {episodeProgress()!.seriesTotalEps} Eps
                </span>
              </Show>
            </div>
          </Show>
        </div>

        {/* Hover chevron */}
        <div
          class="hidden shrink-0 self-center pr-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:flex"
          aria-hidden="true"
        >
          <Icon name="chevron_right" style={CHEVRON_ICON_STYLE} />
        </div>
      </GlassCard>
    </div>
  );
}
