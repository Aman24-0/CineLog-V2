// src/features/dashboard/components/HeroSection.tsx
import { Show } from "solid-js";
import { Button } from "~/shared/ui/primitives";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import type { WatchlistItem } from "~/shared/types";

interface HeroSectionProps {
  item: WatchlistItem | null;
  badge: string;
  isResume: boolean;
  canShuffle: boolean;
  isGuest: boolean;
  onLogin: () => void;
  onShuffle: () => void;
  onOpenMovie: (id: string) => void;
}

export default function HeroSection(props: HeroSectionProps) {
  const bgImg = (item: WatchlistItem) => {
    const path = item.backdrop_path || item.poster_path;
    return path ? tmdbImage(path, item.backdrop_path ? "w780" : "w500") : "";
  };

  const title = (item: WatchlistItem) => item.title || item.name || "Untitled";
  const year = (item: WatchlistItem) =>
    (item.release_date || item.first_air_date || "").split("-")[0];
  const runtime = (item: WatchlistItem) =>
    (item.runtime ?? 0) > 0 ? formatRuntime(item.runtime) : null;

  return (
    <Show
      when={props.item}
      fallback={
        <div
          class="hero-premium flex flex-col items-center justify-center text-center p-6"
          role="region"
          aria-label="Featured title"
        >
          <Show
            when={props.isGuest}
            fallback={
              <div class="empty-premium" style={{ padding: "var(--sp-6)" }}>
                <div class="empty-premium-icon" aria-hidden="true">
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "32px", color: "var(--p)", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  >
                    movie_filter
                  </span>
                </div>
                <p class="empty-premium-title">Empty Vault</p>
                <p class="empty-premium-body">
                  Search for movies and series to start building your collection.
                </p>
              </div>
            }
          >
            <div class="empty-premium" style={{ padding: "var(--sp-6)" }}>
              <div class="empty-premium-icon" aria-hidden="true">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "32px", color: "var(--p)", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                >
                  clapperboard
                </span>
              </div>
              <p class="empty-premium-title">Your Universe Awaits</p>
              <p class="empty-premium-body" style={{ "max-width": "320px" }}>
                Track every movie and series you watch, all in one place.
              </p>
              <Button
                variant="primary"
                size="md"
                icon="login"
                onClick={() => props.onLogin()}
                style={{ "margin-top": "var(--sp-3)" }}
                aria-label="Sign in to begin"
              >
                Sign In to Begin
              </Button>
            </div>
          </Show>
        </div>
      }
    >
      {(item) => (
        <div
          class="hero-premium animate-fade-in"
          role="region"
          aria-label={`Featured: ${title(item())}`}
        >
          <Show when={bgImg(item())}>
            <img
              src={bgImg(item())}
              class="backdrop-img absolute inset-0"
              loading="eager"
              decoding="async"
              {...{ fetchpriority: "high" } as any}
              onLoad={(e) => e.currentTarget.classList.add("img-loaded")}
              alt=""
              aria-hidden="true"
            />
          </Show>

          <Show when={props.badge}>
            <div
              class="absolute top-4 left-4 lg:top-5 lg:left-5 z-10 badge-accent"
              aria-label={props.badge}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px", color: "var(--p)" }}
                aria-hidden="true"
              >
                auto_awesome
              </span>
              {props.badge}
            </div>
          </Show>

          <Show when={item().newSeasonAvailable}>
            <div
              class="absolute top-4 right-4 lg:top-5 lg:right-5 z-10 badge-glow"
              aria-label="New season available"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px" }}
                aria-hidden="true"
              >
                new_releases
              </span>
              New Season
            </div>
          </Show>

          <div class="absolute bottom-0 left-0 w-full p-4 lg:p-6 flex flex-col gap-2 z-10">
            <h2
              class="type-display-lg text-white"
              style={{
                "text-shadow": "0 2px 24px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,1)",
                display: "-webkit-box",
                "-webkit-line-clamp": "2",
                "-webkit-box-orient": "vertical",
                overflow: "hidden",
                "max-width": "100%"
              }}
            >
              {title(item())}
            </h2>

            <div
              class="flex items-center gap-2 type-meta flex-wrap"
              style={{ color: "var(--text-soft)" }}
            >
              <Show when={year(item())}>
                <span>{year(item())}</span>
                <span style={{ color: "var(--text-dim)" }}>·</span>
              </Show>
              <span>{item().media_type === "tv" ? "Series" : "Movie"}</span>
              <Show when={runtime(item())}>
                <span style={{ color: "var(--text-dim)" }}>·</span>
                <span>{runtime(item())}</span>
              </Show>
              <Show when={item().imdbRating || item().rating}>
                <span style={{ color: "var(--text-dim)" }}>·</span>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    "backdrop-filter": "blur(8px)"
                  }}
                  aria-label={`Rating: ${item().imdbRating || item().rating}`}
                >
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "11px",
                      color: "#f5c518",
                      "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                    }}
                    aria-hidden="true"
                  >
                    star
                  </span>
                  <span
                    style={{
                      "font-family": "'Azeret Mono', monospace",
                      "font-size": "10px",
                      "font-weight": 700,
                      color: "#f5c518"
                    }}
                  >
                    {item().imdbRating || item().rating}
                  </span>
                </span>
              </Show>
            </div>

            <Show when={item().genresList && item().genresList!.length > 0}>
              <p
                class="type-meta truncate"
                style={{ color: "var(--text-muted)", "max-width": "100%" }}
              >
                {item().genresList!.join(" · ")}
              </p>
            </Show>

            <div class="flex items-center gap-3 mt-2 flex-wrap">
              <Button
                variant="primary"
                size="md"
                icon={props.isResume ? "play_arrow" : "info"}
                iconFill={props.isResume}
                onClick={() => props.onOpenMovie(item().id)}
                aria-label={
                  props.isResume
                    ? `Resume ${title(item())}`
                    : `View details for ${title(item())}`
                }
              >
                {props.isResume ? "Resume" : "Details"}
              </Button>

              <Show when={props.canShuffle}>
                <Button
                  variant="ghost"
                  size="md"
                  icon="shuffle"
                  onClick={() => props.onShuffle()}
                  aria-label="Shuffle to another featured pick"
                >
                  Shuffle
                </Button>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
