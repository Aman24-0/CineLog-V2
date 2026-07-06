// src/features/dashboard/components/ContinueRail.tsx
import { For, Show, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { EmptyState } from "~/shared/ui/primitives";
import type { WatchlistItem } from "~/shared/types";

interface ContinueRailProps {
  watchlist: WatchlistItem[];
  onOpenMovie: (id: string) => void;
}

/**
 * ContinueRail — rich Continue Watching rail with progress.
 *
 * Each card shows:
 *  - 16:9 backdrop image with cinematic gradient overlay
 *  - Title (1-line clamp)
 *  - Progress bar with gradient fill + percentage
 *  - Episode info (S1 E5) or time remaining (1h 23m left)
 *  - Hover: center play button appears for quick resume
 *
 * The rail is horizontally scrollable with scroll-snap for a premium
 * browsing experience. Cards are 280px wide — wide enough for rich info
 * but narrow enough to show 1-2 cards on mobile.
 *
 * Empty state: premium EmptyState primitive with "No titles in progress".
 */
const ContinueRail: Component<ContinueRailProps> = (props) => {
  const continueList = createMemo(() => {
    return props.watchlist
      .filter((m) => {
        if (!m.watchProgress || m.watchProgress.currentTime <= 0) return false;
        if (m.status === "Completed") return false;
        return true;
      })
      .sort((a, b) => {
        const tA = a.watchProgress?.updatedAt ? new Date(a.watchProgress.updatedAt).getTime() : 0;
        const tB = b.watchProgress?.updatedAt ? new Date(b.watchProgress.updatedAt).getTime() : 0;
        return tB - tA;
      });
  });

  const getProgress = (m: WatchlistItem) => {
    const runtimeBasedDuration = Number(m.runtime) > 0 ? Number(m.runtime) * 60 : 0;
    const fallbackDuration = m.media_type === "tv" ? 45 * 60 : 120 * 60;
    const effectiveDuration =
      Number(m.watchProgress?.duration) > 0
        ? Math.max(Number(m.watchProgress?.duration), runtimeBasedDuration || 0)
        : runtimeBasedDuration || fallbackDuration;

    const pct = effectiveDuration > 0
      ? Math.min(100, Math.max(0, (Number(m.watchProgress?.currentTime || 0) / effectiveDuration) * 100))
      : 0;

    const remaining = Math.max(0, effectiveDuration - Number(m.watchProgress?.currentTime || 0));
    const remainingMins = Math.floor(remaining / 60);

    return {
      pct: Math.round(pct),
      remaining: remainingMins < 60 ? `${remainingMins}m left` : `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m left`,
      episodeInfo: m.media_type === "tv" ? `S${m.season || 1} E${m.episode || 1}` : null
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
                aria-label={`Resume ${m.title || m.name} — ${progress.pct}% watched, ${progress.remaining}`}
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

                  {/* Progress bar */}
                  <div class="continue-rail-card-progress">
                    <div
                      class="continue-rail-card-progress-bar"
                      role="progressbar"
                      aria-valuenow={progress.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${progress.pct}% watched`}
                    >
                      <div
                        class="continue-rail-card-progress-fill"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    <span class="continue-rail-card-progress-text">
                      {progress.pct}%
                    </span>
                  </div>

                  {/* Meta */}
                  <span class="continue-rail-card-meta">
                    {progress.episodeInfo ? `${progress.episodeInfo} · ` : ""}
                    {progress.remaining}
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
