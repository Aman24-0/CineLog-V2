// src/features/profile/components/CurrentlyWatching.tsx
//
// Currently Watching carousel — premium cards for titles in progress.
//
//   Each card shows:
//     • Poster + title
//     • Progress bar (series-wide completion, same value everywhere)
//     • Next episode label (S3 E4 / 8 or "Continue watching")
//     • Days since last watched
//     • Continue button (links to /watchlist)
//
// Visual language:
//   • Horizontal scroll rail, cards lift on hover
//   • Glass cards with poster backdrop, soft gradient
//   • Progress bar uses --p accent (green touchpoint)
//   • Generous padding, rounded corners
//   • Hides entirely when nothing is being watched
//
// Architecture:
//   ProfilePage → CurrentlyWatching → useStats watchlist + progress engine
//                     uses getEpisodeProgress() from ~/shared/utils/progress
//                     (the SINGLE source of truth for progress)

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem } from "~/shared/types";
import { getEpisodeProgress, isWatchable } from "~/shared/utils/progress";
import { GlassCard } from "~/shared/ui/glass";

interface CurrentlyWatchingProps {
  watchlist: Accessor<WatchlistItem[]>;
}

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  try {
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return null;
    const diff = Date.now() - t;
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  } catch {
    return null;
  }
}

function formatDays(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "Watched today";
  if (days === 1) return "Watched yesterday";
  if (days < 7) return `Watched ${days} days ago`;
  if (days < 14) return "Watched last week";
  if (days < 30) return `Watched ${Math.floor(days / 7)} weeks ago`;
  return `Watched ${Math.floor(days / 30)} months ago`;
}

const CurrentlyWatching: Component<CurrentlyWatchingProps> = (props) => {
  const navigate = useNavigate();

  /** All watchable titles, sorted by most recently watched first. */
  const items = createMemo(() => {
    const list = props.watchlist();
    return list
      .filter(isWatchable)
      .sort((a, b) => {
        const ta = a.watchProgress?.updatedAt ? new Date(a.watchProgress.updatedAt).getTime() : 0;
        const tb = b.watchProgress?.updatedAt ? new Date(b.watchProgress.updatedAt).getTime() : 0;
        if (ta === tb) {
          // Fallback: updatedAt / addedAt
          const fa = (a.updatedAt ? new Date(a.updatedAt).getTime() : 0)
                   || (typeof a.addedAt === "string" ? new Date(a.addedAt).getTime() : 0);
          const fb = (b.updatedAt ? new Date(b.updatedAt).getTime() : 0)
                   || (typeof b.addedAt === "string" ? new Date(b.addedAt).getTime() : 0);
          return fb - fa;
        }
        return tb - ta;
      })
      .slice(0, 6);
  });

  return (
    <Show when={items().length > 0}>
      <section class="profile-section currently-watching" aria-label="Currently watching">
        <div class="currently-watching-header">
          <h2 class="currently-watching-title">Currently Watching</h2>
          <p class="currently-watching-subtitle">Pick up where you left off</p>
        </div>

        <div class="currently-watching-rail" role="list">
          <For each={items()}>
            {(item) => {
              const progress = createMemo(() => getEpisodeProgress(item));
              const days = createMemo(() => {
                const dateStr = item.watchProgress?.updatedAt || item.updatedAt
                  || (typeof item.addedAt === "string" ? item.addedAt : null);
                return daysSince(dateStr ?? undefined);
              });

              return (
                <GlassCard variant="glass" class="cw-card" role="listitem">
                  {/* Poster backdrop */}
                  <div class="cw-card-poster-wrap">
                    <Show
                      when={item.poster_path || item.backdrop_path}
                      fallback={
                        <div class="cw-card-poster-fallback">
                          <span class="material-symbols-outlined" aria-hidden="true">
                            {item.media_type === "tv" ? "tv" : "movie"}
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={tmdbImage(item.poster_path ?? item.backdrop_path, "w342")}
                        class="cw-card-poster"
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </Show>
                    <div class="cw-card-poster-overlay" aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <div class="cw-card-body">
                    <p class="cw-card-title">{item.title || item.name}</p>

                    {/* Next episode label */}
                    <p class="cw-card-meta">
                      <Show
                        when={progress()}
                        fallback={
                          <span>Continue watching</span>
                        }
                      >
                        {(p) => (
                          <Show
                            when={p().seriesTotalEps > 0}
                            fallback={<span>{p().label}</span>}
                          >
                            <span>Next: {p().label}</span>
                          </Show>
                        )}
                      </Show>
                    </p>

                    {/* Progress bar */}
                    <Show when={progress() && progress()!.seriesTotalEps > 0}>
                      <div class="cw-card-progress" role="progressbar"
                        aria-valuenow={progress()!.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${item.title || item.name} progress`}
                      >
                        <div
                          class="cw-card-progress-fill"
                          style={{ width: `${progress()!.pct}%` }}
                        />
                      </div>
                    </Show>

                    {/* Days since + Continue button row */}
                    <div class="cw-card-footer">
                      <span class="cw-card-days">{formatDays(days())}</span>
                      <button
                        type="button"
                        class="cw-card-continue focus-ring"
                        onClick={() => navigate("/watchlist")}
                        aria-label={`Continue watching ${item.title || item.name}`}
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                        Continue
                      </button>
                    </div>
                  </div>
                </GlassCard>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
};

export default CurrentlyWatching;
