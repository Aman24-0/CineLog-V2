// src/features/watchlist/components/VaultCard.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import type { WatchlistItem } from "~/shared/types";

interface VaultCardProps {
  item: WatchlistItem;
  date: Date | null;
  onOpenMovie: (id: string) => void;
}

/**
 * Premium timeline card — used in the Timeline view.
 *
 * Design:
 *  - Horizontal layout: [timeline node] [poster] [info cluster] [chevron]
 *  - Timeline node (positioned by parent) shows the day of the month
 *  - Poster: 2:3 ratio thumbnail with refined shadow + lazy load
 *  - Info cluster: title (truncate), badges (type + status), rating row
 *  - Hover: left accent bar appears, card slides right 4px, border brightens
 *  - Touch feedback via .timeline-card active state
 *
 * The card is self-contained — no dependency on parent context beyond props.
 */
export default function VaultCard(props: VaultCardProps) {
  const day = () => (props.date ? props.date.getDate() : "—");
  const monthShort = () =>
    props.date ? props.date.toLocaleString("en-US", { month: "short" }) : "";
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

  return (
    <div
      class="relative flex items-center group cursor-pointer pl-12 pr-3 animate-timeline-in"
      onClick={() => props.onOpenMovie(props.item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpenMovie(props.item.id);
        }
      }}
      role="article"
      tabindex={0}
      aria-label={`${title()}, ${props.date ? props.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "date unknown"}`}
    >
      {/* Timeline node — date indicator */}
      <div
        class="absolute left-[1.25rem] -translate-x-1/2 z-10 flex flex-col items-center justify-center w-10 h-10 rounded-full"
        style={{
          background: "var(--tier-1)",
          border: "2px solid var(--p)",
          "box-shadow": "0 0 0 3px var(--tier-1), 0 0 12px var(--p-glow), 0 4px 8px rgba(0,0,0,0.4)"
        }}
        aria-hidden="true"
      >
        <span style={{ color: "var(--text-strong)", "font-size": "12px", "font-weight": 800, "font-family": "'Bebas Neue', cursive", "line-height": 1 }}>
          {day()}
        </span>
        <Show when={monthShort()}>
          <span style={{ color: "var(--p)", "font-size": "7px", "font-weight": 700, "letter-spacing": "0.06em", "text-transform": "uppercase", "font-family": "'Azeret Mono', monospace", "line-height": 1, "margin-top": "1px" }}>
            {monthShort()}
          </span>
        </Show>
      </div>

      {/* Timeline card body */}
      <div class="timeline-card w-full p-3 rounded-[1.5rem] flex gap-3 items-center">
        {/* Poster thumbnail */}
        <Show
          when={posterUrl()}
          fallback={
            <div
              class="w-14 h-20 sm:w-16 sm:h-24 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--tier-3)", border: "1px solid var(--hairline)" }}
              aria-hidden="true"
            >
              <Icon name="movie" style="color: var(--text-dim); font-size: 20px" />
            </div>
          }
        >
          <div
            class="w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden relative shrink-0"
            style={{ background: "var(--tier-3)", "box-shadow": "var(--shadow-premium)" }}
          >
            <div class="poster-loading" aria-hidden="true" />
            <img
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
          </div>
        </Show>

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

          <div class="flex items-center gap-2 flex-wrap">
            <Show when={props.item.imdbRating}>
              <span class="inline-flex items-center gap-1 type-meta" style={{ "font-size": "0.5625rem", color: "#f5c518" }}>
                <Icon name="star" fill style="font-size: 10px; color: #f5c518" aria-hidden="true" />
                {props.item.imdbRating}
              </span>
            </Show>
            <Show when={props.item.rating}>
              <span class="inline-flex items-center gap-1 type-meta" style={{ "font-size": "0.5625rem", color: "var(--p)" }}>
                <Icon name="person" fill style="font-size: 10px; color: var(--p)" aria-hidden="true" />
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
                <Icon name="task_alt" style="font-size: 10px" aria-hidden="true" />
                {statusLabel()}
              </span>
            </Show>
          </div>
        </div>

        {/* Hover chevron */}
        <div
          class="hidden sm:flex self-center pr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0"
          aria-hidden="true"
        >
          <Icon name="chevron_right" style="font-size: 24px; color: var(--p)" />
        </div>
      </div>
    </div>
  );
}
