// src/features/dashboard/components/ContinueRail.tsx
import { For, Show, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { EmptyState } from "~/shared/ui/primitives";
import { isWatchable, getContinueWatchingList } from "~/shared/utils/progress";
import type { WatchlistItem } from "~/shared/types";

interface ContinueRailProps {
  watchlist: WatchlistItem[];
  onOpenMovie: (id: string) => void;
}

/**
 * ContinueRail — rich Continue Watching rail with progress.
 *
 * Uses the shared progress engine (isWatchable gate + getContinueWatchingList).
 * Only status === "Watching" titles appear — no legacy V1 progress data.
 *
 * Progress is calculated from season/episode only (no currentTime).
 */
const ContinueRail: Component<ContinueRailProps> = (props) => {
  const continueList = createMemo(() => getContinueWatchingList(props.watchlist));

  const getProgress = (m: WatchlistItem) => {
    if (!isWatchable(m)) return null;
    if (m.media_type !== "tv") return null;

    const season = m.season || 1;
    const episode = m.episode || 1;
    const totalEps = m.totalEps || 0;
    const pct = totalEps > 0 ? Math.min(100, Math.max(0, (episode / totalEps) * 100)) : 0;

    return {
      pct: Math.round(pct),
      episodeInfo: `S${season} E${episode}${totalEps > 0 ? ` / ${totalEps}` : ""}`
    };
  };

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
                aria-label={`Resume ${m.title || m.name}${progress ? ` — ${progress.episodeInfo}, ${progress.pct}%` : ""}`}
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
                        aria-label={`${progress!.pct}% through season`}
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
                      {progress!.episodeInfo}
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
