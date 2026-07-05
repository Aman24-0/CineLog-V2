// src/features/dashboard/components/ContinueWatching.tsx
import { For, Show, createMemo, Component } from "solid-js";
import Icon from "~/shared/ui/Icon";
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
      
    return { 
      pct: Math.round(pct), 
      effectiveDuration, 
      current: Number(m.watchProgress?.currentTime || 0) 
    };
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div class="animate-fade-up" role="region" aria-label="Continue watching">
      <p class="type-section-title mb-4 mt-8 px-1">Continue Watching</p>
      
      <Show 
        when={continueWatchingList().length > 0}
        fallback={
          <div class="empty-state py-8">
            <div class="empty-state-icon" aria-hidden="true">
              <Icon name="play_circle" style="color: var(--muted); font-size: 36px" />
            </div>
            <p class="empty-state-title">No titles in progress</p>
            <p class="empty-state-body">Start watching something to see it here.</p>
          </div>
        }
      >
        <div class="flex gap-4 overflow-x-auto hide-scrollbar pb-4" role="list">
          <For each={continueWatchingList()}>
            {(m) => {
              const progress = getProgress(m);
              const bgImg = m.backdrop_path
                ? `https://image.tmdb.org/t/p/w500${m.backdrop_path}`
                : m.poster_path
                  ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
                  : "";

              return (
                <div
                  class="continue-card relative w-64 h-36 shrink-0 cursor-pointer group"
                  role="listitem"
                >
                  <Show 
                    when={bgImg} 
                    fallback={
                      <div class="absolute inset-0 flex items-center justify-center" style="background: linear-gradient(105deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 75%); background-size: 300% 100%; animation: shimmer 1.4s ease-in-out infinite;" aria-hidden="true">
                        <Icon name="movie" class="text-4xl text-gray-700" />
                      </div>
                    }
                  >
                    <img
                      src={bgImg}
                      class="continue-card-img absolute inset-0"
                      onLoad={(e) => e.currentTarget.classList.add("img-loaded")}
                      alt=""
                      aria-hidden="true"
                    />
                  </Show>

                  <div class="continue-card-gradient" aria-hidden="true" />

                  <div
                    class="absolute inset-0 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 group-focus:opacity-100"
                    style="transition: opacity 200ms ease-out"
                    aria-hidden="true"
                  >
                    <div
                      class="w-12 h-12 rounded-full flex items-center justify-center border"
                      style="background: rgba(0,0,0,0.60); backdrop-filter: blur(8px); border-color: color-mix(in srgb, var(--p2) 60%, transparent); box-shadow: 0 0 16px var(--p-glow)"
                    >
                      <Icon name="play_arrow" fill style="color: var(--p2); font-size: 24px" />
                    </div>
                  </div>

                  <div class="absolute bottom-0 left-0 w-full p-3.5 z-10">
                    <h4 class="type-card-title truncate mb-2">{m.title || m.name}</h4>

                    <div
                      class="w-full h-1 rounded-full overflow-hidden mb-2"
                      style="background: rgba(255,255,255,0.12)"
                      role="progressbar"
                      aria-valuenow={progress.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${progress.pct}% watched`}
                    >
                      <div
                        class="h-full rounded-full"
                        style={`width: ${progress.pct}%; background: var(--p2); box-shadow: 0 0 6px var(--p-glow); transition: width 500ms ease-out`}
                      />
                    </div>

                    <div class="flex justify-between items-center mb-2">
                      <span class="type-caption" style="color: rgba(255,255,255,0.55)">
                        {m.media_type === "tv" 
                          ? `S${m.season || 1} E${m.episode || 1}` 
                          : `${formatTime(progress.current)} / ${formatTime(progress.effectiveDuration)}`
                        }
                      </span>
                      <span class="type-caption" style="color: var(--p2)">{progress.pct}%</span>
                    </div>

                    <button 
                      onClick={() => props.onOpenMovie(m.id)}
                      class="w-full py-1.5 rounded-lg type-caption font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                      style="background: rgba(0,0,0,0.5); color: white; border: 1px solid var(--p2)"
                      aria-label={`Resume ${m.title || m.name}`}
                    >
                      <Icon name="play_arrow" class="text-sm" /> Resume
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
