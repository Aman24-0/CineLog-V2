// src/features/dashboard/components/HeroSection.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { WatchlistItem } from "~/shared/types";

interface HeroSectionProps {
  item: WatchlistItem | null;
  isGuest: boolean;
  isRandomPlanned: boolean;
  onLogin: () => void;
  onShuffle: () => void;
  onOpenMovie: (id: string) => void;
}

export default function HeroSection(props: HeroSectionProps) {
  const bgImg = () => {
    if (!props.item) return "";
    return props.item.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${props.item.backdrop_path}`
      : props.item.poster_path
        ? `https://image.tmdb.org/t/p/w500${props.item.poster_path}`
        : "";
  };

  return (
    <Show
      when={props.item}
      fallback={
        <div class="featured-hero flex flex-col items-center justify-center text-center p-6" role="region" aria-label="Featured title">
          <Show
            when={props.isGuest}
            fallback={
              <div class="empty-state">
                <div class="empty-state-icon" aria-hidden="true">
                  <Icon name="movie_filter" fill style="color: var(--p); font-size: 36px" />
                </div>
                <p class="empty-state-title">Empty Vault</p>
                <p class="empty-state-body">Search for movies and series to start building your collection.</p>
              </div>
            }
          >
            <div class="empty-state">
              <div class="empty-state-icon" aria-hidden="true">
                <Icon name="clapperboard" fill style="color: var(--p); font-size: 36px" />
              </div>
              <p class="empty-state-title">Your Universe Awaits</p>
              <p class="empty-state-body mb-2">Track every movie and series you watch, all in one place.</p>
              <button
                onClick={() => props.onLogin()}
                class="type-button px-6 py-3 rounded-full text-black active:scale-95 mt-2"
                style="background: var(--p); box-shadow: 0 0 20px var(--p-glow)"
              >
                Sign In to Begin
              </button>
            </div>
          </Show>
        </div>
      }
    >
      {(item) => (
        <div class="featured-hero" role="region" aria-label={`Featured: ${item().title || item().name}`}>
          <Show when={bgImg()}>
            <img
              src={bgImg()}
              class="backdrop-img absolute inset-0"
              onLoad={(e) => e.currentTarget.classList.add("img-loaded")}
              alt=""
              aria-hidden="true"
            />
          </Show>

          <div class="backdrop-gradient" aria-hidden="true" />

          <Show when={props.isRandomPlanned}>
            <div
              class="absolute top-4 left-4 lg:top-5 lg:left-5 z-10"
              style="background: rgba(0,0,0,0.65); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.12); padding: 5px 12px; border-radius: 100px; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.5)"
              aria-label="Random pick from planned list"
            >
              <Icon name="casino" style="color: var(--p); font-size: 13px" aria-hidden="true" />
              <span class="type-caption text-white">Random Pick</span>
            </div>
          </Show>

          <div class="absolute bottom-0 left-0 w-full p-4 lg:p-6 flex flex-col gap-2 z-10">
            <h2
              class="font-headline text-3xl lg:text-5xl text-white leading-none"
              style="text-shadow: 0 2px 24px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,1); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
            >
              {item().title || item().name}
            </h2>

            <div class="flex items-center gap-3 type-metadata text-gray-300 flex-wrap">
              <span>{(item().release_date || item().first_air_date || "").split("-")[0]}</span>
              <Show when={item().media_type === "tv"}>
                <span class="type-caption bg-white/10 px-2 py-0.5 rounded text-gray-400">Series</span>
              </Show>
              <Show when={item().imdbRating || item().rating}>
                <span class="rating-pill" aria-label={`IMDb: ${item().imdbRating || item().rating}`}>
                  <Icon name="star" fill style="color: #f5c518; font-size: 11px" aria-hidden="true" />
                  {item().imdbRating || item().rating}
                </span>
              </Show>
            </div>

            <div class="flex items-center gap-3 mt-1 flex-wrap">
              <button
                onClick={() => props.onOpenMovie(item().id)}
                class="type-button bg-white text-black px-6 py-2.5 rounded-full flex items-center gap-2 active:scale-95 shrink-0"
                style="box-shadow: 0 4px 16px rgba(0,0,0,0.6)"
                aria-label={`View details for ${item().title || item().name}`}
              >
                <Icon name="info" fill class="text-xl" aria-hidden="true" /> Details
              </button>
              <button
                onClick={() => props.onShuffle()}
                class="type-button px-6 py-2.5 rounded-full flex items-center gap-2 active:scale-95 shrink-0"
                style="background: rgba(255,255,255,0.10); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.20); color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.4)"
                aria-label="Shuffle to a random planned title"
              >
                <Icon name="shuffle" class="text-xl" aria-hidden="true" /> Shuffle
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
