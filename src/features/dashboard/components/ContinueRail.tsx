// src/features/dashboard/components/ContinueRail.tsx
import { For, Show, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { EmptyState } from "~/shared/ui/primitives";
import { getContinueWatchingList, getEpisodeProgress } from "~/shared/utils/progress";
import type { WatchlistItem } from "~/shared/types";

interface ContinueRailProps {
  watchlist: WatchlistItem[];
  onOpenMovie: (id: string) => void;
}

/**
 * ContinueRail — rich Continue Watching rail with progress.
 *
 * Uses the shared progress engine (getEpisodeProgress + getContinueWatchingList).
 * Only status === "Watching" titles appear — no legacy V1 progress data.
 *
 * The percentage is SERIES-WIDE (sum of completed episodes across all
 * seasons ÷ total episodes across all seasons). This is the SAME value
 * shown on the Dashboard Hero, Details page, Vault, and Stats — there is
 * no other formula anywhere in the codebase.
 */
const ContinueRail: Component<ContinueRailProps> = (props) => {
  const continueList = createMemo(() => getContinueWatchingList(props.watchlist));

  // Single source of truth — no local formula.
  const getProgress = (m: WatchlistItem) => getEpisodeProgress(m);

  const bgImg = (m: WatchlistItem) => {
    const path = m.backdrop_path || m.poster_path;
    return path ? tmdbImage(path, "w500") : "";
  };

  return (
    <Show
      when={continueList().length > 0}
      fallback={
        <EmptyState
          icon="play_circle"
          iconFill
          title="No titles in progress"
          message="Start watching something to see it here."
        />
      }
    >
      <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-2" style={{ "scroll-snap-type": "x proximity" }} role="list">
        <For each={continueList()}>
          {(m) => {
            const progress = getProgress(m);
            const img = bgImg(m);

            return (
              <div
                class="continue-rail-card"
                role="listitem"
                onClick={() => props.onOpenMovie(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onOpenMovie(m.id);
                  }
                }}
                tabindex={0}
                aria-label={`Resume ${m.title || m.name}${progress ? ` — ${progress.label}, ${progress.pct}%` : ""}`}
                style={{ "scroll-snap-align": "start" }}
              >
                {/* Backdrop image */}
                <Show
                  when={img}
                  fallback={
                    <div class="absolute inset-0 flex items-center justify-center skeleton-base" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--text-dim)" }} aria-hidden="true">movie</span>
                    </div>
                  }
                >
                  <img
                    src={img}
                    class="continue-rail-card-img"
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => e.currentTarget.classList.add("img-loaded")}
                    alt=""
                    aria-hidden="true"
                  />
                </Show>

                {/* Gradient overlay */}
                <div class="continue-rail-card-overlay" aria-hidden="true" />

                {/* New Season badge */}
                <Show when={m.newSeasonAvailable}>
                  <div
                    class="absolute top-2 right-2 z-20 badge-glow"
                    style={{ "font-size": "7px", padding: "3px 8px" }}
                    aria-label="New season available"
                  >
                    New Season
                  </div>
                </Show>

                {/* Hover resume button */}
                <div class="continue-rail-card-resume" aria-hidden="true">
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "24px",
                      color: "var(--p2)",
                      "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                    }}
                    aria-hidden="true"
                  >
                    play_arrow
                  </span>
                </div>

                {/* Content cluster */}
                <div class="continue-rail-card-content">
                  <h4 class="continue-rail-card-title">{m.title || m.name}</h4>

                  {/* Progress bar — only for TV with episode data */}
                  <Show when={progress}>
                    <div class="continue-rail-card-progress">
                      <div
                        class="continue-rail-card-progress-bar"
                        role="progressbar"
                        aria-valuenow={progress!.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${progress!.pct}% of series complete`}
                      >
                        <div
                          class="continue-rail-card-progress-fill"
                          style={{ width: `${progress!.pct}%` }}
                        />
                      </div>
                      <span class="continue-rail-card-progress-text">
                        {progress!.pct}%
                      </span>
                    </div>
                  </Show>

                  {/* Meta */}
                  <span class="continue-rail-card-meta">
                    <Show when={progress}>
                      {progress!.label}
                    </Show>
                    <Show when={!progress}>
                      {m.media_type === "tv" ? "Series" : "Movie"}
                    </Show>
                  </span>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export default ContinueRail;
