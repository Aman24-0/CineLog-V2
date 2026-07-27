// src/features/watchlist/components/VaultCard.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { getEpisodeProgress } from "~/shared/utils/progress";
import type { WatchlistItem } from "~/shared/types";
import { GlassCard } from "~/shared/ui/glass";

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
    (props.item.release_date || props.item.first_air_date || "").split("-")[0] || "";

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

  return (
    <div
      class="relative flex items-center group cursor-pointer pl-3 pr-3 animate-timeline-in"
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
          class="timeline-day-pill shrink-0 flex flex-col items-center justify-center"
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
      <GlassCard variant="glass" class="timeline-card w-full p-3 rounded-[1.5rem] flex gap-3 items-center" interactive>
        {/* Poster thumbnail with progress bar */}
        <div
          class="w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden relative shrink-0"
          style={{ background: "var(--tier-3)", "box-shadow": "var(--shadow-premium)" }}
        >
          <Show
            when={posterUrl()}
            fallback={
              <div class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <Icon name="movie" style={{"color":"var(--text-dim)","font-size":"20px"}} />
              </div>
            }
          >
            <div class="poster-loading" aria-hidden="true" />
            <img
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              src={posterUrl()}
              class="poster-img absolute inset-0 w-full h-full object-cover"
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
              class="absolute bottom-0 left-0 w-full h-1"
              style={{ background: "rgba(255,255,255,0.20)" }}
              aria-hidden="true"
            >
              <div
                class="h-full"
                style={{
                  background: "var(--p, #e8b74a)",
                  width: `${episodeProgress()!.pct}%`,
                  transition: "width 400ms ease-out",
                }}
              />
            </div>
          </Show>

          {/* Selection mode checkbox overlay */}
          <Show when={props.isSelectionMode}>
            <div
              class="absolute top-1 right-1 z-[4] flex items-center justify-center rounded-full"
              style={{
                width: "24px",
                height: "24px",
                background: props.isSelected ? "var(--p)" : "rgba(0,0,0,0.5)",
                border: props.isSelected ? "none" : "2px solid rgba(255,255,255,0.3)",
              }}
              aria-hidden="true"
            >
              <Show when={props.isSelected}>
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px", color: "var(--on-primary, #0a0a0a)" }}
                >
                  check
                </span>
              </Show>
            </div>
          </Show>
        </div>

        {/* Info cluster */}
        <div class="flex-1 flex flex-col justify-center py-1 min-w-0 gap-1.5">
          <p
            class="type-headline text-white group-hover:text-white truncate"
            style={{ "font-size": "0.875rem", "font-weight": 700, margin: 0 }}
          >
            {title()}
          </p>

          <div class="flex items-center gap-1.5 flex-wrap">
            <span
              class="type-meta shrink-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--text-soft)",
                padding: "2px 6px",
                "border-radius": "4px",
                "font-size": "0.5rem",
                border: "1px solid var(--hairline)"
              }}
            >
              {props.item.media_type === "tv" ? "Series" : "Movie"}
            </span>
            <Show when={year()}>
              <span class="type-meta shrink-0" style={{ "font-size": "0.5rem", color: "var(--text-muted)" }}>
                {year()}
              </span>
            </Show>
            <Show when={props.item.runtime && props.item.runtime > 0}>
              <span class="type-meta shrink-0" style={{ "font-size": "0.5rem", color: "var(--text-muted)" }}>
                · {formatRuntime(props.item.runtime)}
              </span>
            </Show>
          </div>

          {/* TV episode progress text (for watching TV shows) OR rating row */}
          <Show
            when={episodeProgress()}
            fallback={
              <div class="flex items-center gap-2 flex-wrap">
                <Show when={props.item.imdbRating}>
                  <span class="inline-flex items-center gap-1 type-meta" style={{ "font-size": "0.5625rem", color: "#f5c518" }}>
                    <Icon name="star" fill style={{"font-size":"10px","color":"#f5c518"}} aria-hidden="true" />
                    {props.item.imdbRating}
                  </span>
                </Show>
                <Show when={props.item.rating}>
                  <span class="inline-flex items-center gap-1 type-meta" style={{ "font-size": "0.5625rem", color: "var(--p)" }}>
                    <Icon name="person" fill style={{"font-size":"10px","color":"var(--p)"}} aria-hidden="true" />
                    {props.item.rating}/10
                  </span>
                </Show>
                <Show when={props.item.status === "Completed"}>
                  <span
                    class="inline-flex items-center gap-1 type-meta shrink-0"
                    style={{
                      "font-size": "0.5rem",
                      color: "#60a5fa",
                      background: "rgba(96,165,250,0.08)",
                      border: "1px solid rgba(96,165,250,0.25)",
                      padding: "2px 6px",
                      "border-radius": "var(--radius-pill)"
                    }}
                  >
                    <Icon name="task_alt" style={{"font-size":"10px"}} aria-hidden="true" />
                    {statusLabel()}
                  </span>
                </Show>
              </div>
            }
          >
            {/* TV episode progress text: S{season} E{episode} • {watched}/{total} Eps
                When totalEps is 0 (no season data), show ONLY S{season} E{episode}. */}
            <div class="flex items-center gap-1.5 type-meta" style={{ "font-size": "0.5625rem" }}>
              <span style={{ color: "var(--p)", "font-weight": 600 }}>
                S{episodeProgress()!.season} E{episodeProgress()!.episode}
              </span>
              <Show when={episodeProgress()!.seriesTotalEps > 0}>
                <span style={{ color: "var(--text-dim)" }}>·</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {episodeProgress()!.seriesCompletedEps}/{episodeProgress()!.seriesTotalEps} Eps
                </span>
              </Show>
            </div>
          </Show>
        </div>

        {/* Hover chevron */}
        <div
          class="hidden sm:flex self-center pr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0"
          aria-hidden="true"
        >
          <Icon name="chevron_right" style={{"font-size":"24px","color":"var(--p)"}} />
        </div>
      </GlassCard>
    </div>
  );
}
