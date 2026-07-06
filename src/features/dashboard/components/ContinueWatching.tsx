// src/features/dashboard/components/ContinueWatching.tsx
import { For, Show, createMemo, Component } from "solid-js";
import { SectionHeader, EmptyState } from "~/shared/ui/primitives";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem } from "~/shared/types";

interface ContinueWatchingProps {
  watchlist: WatchlistItem[];
  onOpenMovie: (id: string) => void;
}

const ContinueWatching: Component<ContinueWatchingProps> = (props) => {
  const continueWatchingList = createMemo(() => {
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

    return { pct: Math.round(pct), effectiveDuration, current: Number(m.watchProgress?.currentTime || 0) };
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const bgImg = (m: WatchlistItem) => {
    const path = m.backdrop_path || m.poster_path;
    return path ? tmdbImage(path, "w500") : "";
  };

  return (
    <div class="animate-fade-up" role="region" aria-label="Continue watching">
      <SectionHeader title="Continue Watching" icon="play_circle" />

      <Show
        when={continueWatchingList().length > 0}
        fallback={
          <EmptyState
            icon="play_circle"
            iconFill
            title="No titles in progress"
            message="Start watching something to see it here."
          />
        }
      >
        <div class="rail-premium hide-scrollbar" role="list">
          <For each={continueWatchingList()}>
            {(m) => {
              const progress = getProgress(m);
              const img = bgImg(m);

              return (
                <div
                  class="continue-premium relative w-64 h-36 shrink-0 cursor-pointer group touch-ripple"
                  role="listitem"
                  onClick={() => props.onOpenMovie(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      props.onOpenMovie(m.id);
                    }
                  }}
                  tabindex={0}
                  aria-label={`Resume ${m.title || m.name} — ${progress.pct}% watched`}
                >
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
                      class="continue-card-img absolute inset-0"
                      loading="lazy"
                      decoding="async"
                      onLoad={(e) => e.currentTarget.classList.add("img-loaded")}
                      alt=""
                      aria-hidden="true"
                    />
                  </Show>

                  <div class="continue-card-gradient" aria-hidden="true" />

                  <Show when={m.newSeasonAvailable}>
                    <div class="absolute top-2 right-2 z-20 badge-glow" aria-label="New season available">
                      New Season
                    </div>
                  </Show>

                  <div
                    class="absolute inset-0 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 group-focus:opacity-100"
                    style={{ transition: "opacity 200ms ease-out" }}
                    aria-hidden="true"
                  >
                    <div
                      class="w-12 h-12 rounded-full flex items-center justify-center border"
                      style={{
                        background: "rgba(0,0,0,0.60)",
                        "backdrop-filter": "blur(8px)",
                        "border-color": "color-mix(in srgb, var(--p2) 60%, transparent)",
                        "box-shadow": "0 0 16px var(--p-glow)"
                      }}
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "24px", color: "var(--p2)", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                        aria-hidden="true"
                      >
                        play_arrow
                      </span>
                    </div>
                  </div>

                  <div class="absolute bottom-0 left-0 w-full p-3.5 z-10">
                    <h4 class="type-card-title truncate mb-2" style={{ "font-size": "0.75rem" }}>
                      {m.title || m.name}
                    </h4>

                    <div
                      class="progress-premium mb-2"
                      role="progressbar"
                      aria-valuenow={progress.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${progress.pct}% watched`}
                    >
                      <div class="progress-premium-fill" style={{ width: `${progress.pct}%` }} />
                    </div>

                    <div class="flex justify-between items-center mb-2">
                      <span class="type-meta" style={{ "font-size": "0.5rem", color: "rgba(255,255,255,0.55)" }}>
                        {m.media_type === "tv"
                          ? `S${m.season || 1} E${m.episode || 1}`
                          : `${formatTime(progress.current)} / ${formatTime(progress.effectiveDuration)}`}
                      </span>
                      <span class="type-meta" style={{ "font-size": "0.5rem", color: "var(--p2)" }}>
                        {progress.pct}%
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onOpenMovie(m.id);
                      }}
                      class="w-full py-1.5 rounded-lg type-meta flex items-center justify-center gap-1 active:scale-95 transition-transform"
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        color: "white",
                        border: "1px solid color-mix(in srgb, var(--p2) 40%, transparent)",
                        "font-size": "0.5625rem",
                        "font-weight": 700
                      }}
                      aria-label={`Resume ${m.title || m.name}`}
                    >
                      <span class="material-symbols-outlined" style={{ "font-size": "12px", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">play_arrow</span>
                      Resume
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ContinueWatching;
