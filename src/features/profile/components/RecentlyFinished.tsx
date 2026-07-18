// src/features/profile/components/RecentlyFinished.tsx
//
// Recently Finished carousel — premium cards for completed titles.
//
//   Each card shows:
//     • Poster
//     • Title
//     • "Finished 3 days ago" timestamp
//     • ★★★★★ rating (filled stars out of 5)
//     • One-word reaction (Masterpiece / Heartbreaking / Mind-blowing / Beautiful)
//
// Visual language:
//   • Horizontal scroll rail matching the Currently Watching rail
//   • Glass cards with poster backdrop, soft gradient
//   • Rating stars in gold (--color-collection-favorites)
//   • One-word reaction in display family (Bebas Neue), green-accent border
//   • Hides entirely when nothing is finished
//
// Architecture:
//   ProfilePage → RecentlyFinished → storyGenerator.generateOneWordReaction

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem } from "~/shared/types";
import { generateOneWordReaction } from "../utils/storyGenerator";

interface RecentlyFinishedProps {
  watchlist: Accessor<WatchlistItem[]>;
}

function daysSinceCompleted(item: WatchlistItem): number | null {
  // Prefer updatedAt (status change time), fallback to watchDate / addedAt
  const dateStr = item.updatedAt || item.watchDate
    || (typeof item.addedAt === "string" ? item.addedAt : null);
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

function formatFinished(days: number | null): string {
  if (days === null) return "Finished recently";
  if (days === 0) return "Finished today";
  if (days === 1) return "Finished yesterday";
  if (days < 7) return `Finished ${days} days ago`;
  if (days < 14) return "Finished last week";
  if (days < 30) return `Finished ${Math.floor(days / 7)} weeks ago`;
  return `Finished ${Math.floor(days / 30)} months ago`;
}

/** Convert a 1-10 rating to a 1-5 star rating (rounded to nearest 0.5). */
function ratingToStars(rating: number | undefined): number {
  if (!rating || rating <= 0) return 0;
  return Math.round((rating / 2) * 2) / 2;  // nearest 0.5
}

function renderStars(stars: number): { filled: boolean; half: boolean }[] {
  const out: { filled: boolean; half: boolean }[] = [];
  for (let i = 1; i <= 5; i++) {
    if (stars >= i) out.push({ filled: true, half: false });
    else if (stars >= i - 0.5) out.push({ filled: false, half: true });
    else out.push({ filled: false, half: false });
  }
  return out;
}

const RecentlyFinished: Component<RecentlyFinishedProps> = (props) => {
  const items = createMemo(() => {
    const list = props.watchlist();
    return list
      .filter((m) => m.status === "Completed")
      .sort((a, b) => {
        const ta = new Date(a.updatedAt || a.watchDate || (typeof a.addedAt === "string" ? a.addedAt : 0)).getTime();
        const tb = new Date(b.updatedAt || b.watchDate || (typeof b.addedAt === "string" ? b.addedAt : 0)).getTime();
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })
      .slice(0, 8);
  });

  return (
    <Show when={items().length > 0}>
      <section class="profile-section recently-finished" aria-label="Recently finished">
        <div class="recently-finished-header">
          <h2 class="recently-finished-title">Recently Finished</h2>
          <p class="recently-finished-subtitle">Stories that found their ending</p>
        </div>

        <div class="recently-finished-rail" role="list">
          <For each={items()}>
            {(item) => {
              const days = createMemo(() => daysSinceCompleted(item));
              const stars = createMemo(() => ratingToStars(item.rating));
              const reaction = createMemo(() => generateOneWordReaction(item.rating));

              return (
                <article class="rf-card" role="listitem">
                  <div class="rf-card-poster-wrap">
                    <Show
                      when={item.poster_path || item.backdrop_path}
                      fallback={
                        <div class="rf-card-poster-fallback">
                          <span class="material-symbols-outlined" aria-hidden="true">
                            {item.media_type === "tv" ? "tv" : "movie"}
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={tmdbImage(item.poster_path ?? item.backdrop_path, "w342")}
                        class="rf-card-poster"
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </Show>
                    <div class="rf-card-poster-overlay" aria-hidden="true" />

                    {/* One-word reaction chip — bottom-left over poster */}
                    <Show when={reaction()}>
                      {(r) => (
                        <div class="rf-card-reaction" aria-label={`Reaction: ${r().word}`}>
                          {r().word}
                        </div>
                      )}
                    </Show>
                  </div>

                  <div class="rf-card-body">
                    <p class="rf-card-title">{item.title || item.name}</p>
                    <p class="rf-card-finished">{formatFinished(days())}</p>

                    {/* Star rating */}
                    <Show when={stars() > 0}>
                      <div class="rf-card-stars" role="img"
                        aria-label={`Rated ${stars()} out of 5 stars`}
                      >
                        <For each={renderStars(stars())}>
                          {(s) => (
                            <span class={`rf-star ${s.filled ? "rf-star-filled" : ""} ${s.half ? "rf-star-half" : ""}`}
                              aria-hidden="true"
                            >
                              ★
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </article>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
};

export default RecentlyFinished;
