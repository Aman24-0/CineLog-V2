// src/features/discover/TheatresPage.tsx
//
// TheatresPage — full-page view of movies currently in theatres for the
// user's selected country. Reached from the "Running in Theatres"
// section's "See All" button on the Discover page.
//
// Uses the SAME data source as the Discover section:
//   getNowPlaying(region) from ~/core/tmdb/discover
//   region from useDiscoverRegion() (reactive — changes when the user
//   updates their country in Account settings).
//
// The page is intentionally simple — a PageContainer with a back button,
// a heading, and a grid of movie cards using the existing DiscoverRail
// card style. No filters, no calendar, no sorting — just the raw
// now-playing list for the user's region.

import {
  createSignal,
  Show,
  For,
  onMount,
  on,
  createEffect,
  type Component
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import { getNowPlaying } from "~/core/tmdb/discover";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { isTmdb404 } from "~/core/tmdb/tmdb";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";

const TheatresPage: Component = () => {
  const navigate = useNavigate();
  const region = useDiscoverRegion();
  const [titles, setTitles] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle } = useDiscoverActions({
    watchlist,
    isGuest
  });

  const fetchTheatres = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = region();
      const result = await getNowPlaying(r);
      setTitles(result);
    } catch (err) {
      if (!isTmdb404(err)) {
        console.warn("[TheatresPage] fetch failed:", err);
      }
      setError("Failed to load theatrical movies. Please try again.");
      setTitles([]);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchTheatres);

  // Reactive: refetch when the user changes their country.
  createEffect(
    on(
      region,
      () => {
        void fetchTheatres();
      },
      { defer: true }
    )
  );

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      {/* Back button */}
      <button
        type="button"
        class="btn-ghost focus-ring"
        onClick={() => navigate("/discover")}
        style={{ "margin-bottom": "var(--sp-4)" }}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          arrow_back
        </span>
        Back to Discover
      </button>

      <div class="discover-fold-header" style={{ "margin-bottom": "var(--sp-4)" }}>
        <div class="discover-fold-label">
          <span class="material-symbols-outlined" aria-hidden="true">
            theaters
          </span>
          Running in Theatres
        </div>
      </div>

      <p
        class="type-micro"
        style={{ color: "var(--text-muted)", "margin-bottom": "var(--sp-4)" }}
      >
        Movies currently playing in theatres for your selected country ({region()}).
      </p>

      <Show when={loading()}>
        <div class="search-rail">
          <For each={Array.from({ length: 8 })}>
            {() => (
              <div class="search-rail-card">
                <div class="search-rail-poster skeleton-base" />
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={!loading() && error()}>
        <div class="glass-empty-state" role="alert">
          <h3 class="glass-empty-state-title">Something went wrong</h3>
          <p class="glass-empty-state-body">{error()}</p>
          <button
            class="btn-primary focus-ring"
            onClick={() => void fetchTheatres()}
            style={{ "margin-top": "var(--sp-2)" }}
          >
            Retry
          </button>
        </div>
      </Show>

      <Show when={!loading() && !error() && titles().length === 0}>
        <div class="glass-empty-state">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "48px", color: "var(--text-dim)" }}
            aria-hidden="true"
          >
            theaters
          </span>
          <h3 class="glass-empty-state-title">No movies in theatres</h3>
          <p class="glass-empty-state-body">
            There are no currently playing theatrical movies for your selected country.
            Try changing your country in Settings.
          </p>
        </div>
      </Show>

      <Show when={!loading() && !error() && titles().length > 0}>
        <div class="search-rail" style={{ "flex-wrap": "wrap", "overflow-x": "visible" }}>
          <For each={titles()}>
            {(title) => (
              <button
                type="button"
                class="search-rail-card"
                onClick={() => handleOpenTitle(title)}
                style={{ cursor: "pointer", "text-align": "left" }}
                aria-label={`${title.title || title.name || "Untitled"} — open details`}
              >
                <Show
                  when={title.poster_path}
                  fallback={
                    <div class="search-rail-poster" style={{ display: "flex", "align-items": "center", "justify-content": "center" }}>
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "28px", color: "var(--text-dim)" }}
                        aria-hidden="true"
                      >
                        movie
                      </span>
                    </div>
                  }
                >
                  <img
                    src={tmdbImage(title.poster_path, "w342") ?? ""}
                    alt=""
                    class="search-rail-poster"
                    loading="lazy"
                    decoding="async"
                  />
                </Show>
                <p class="search-rail-title">
                  {title.title || title.name || "Untitled"}
                </p>
                <p class="search-rail-meta">
                  {(title.release_date || title.first_air_date || "").slice(0, 4)}
                  {" · Movie"}
                </p>
              </button>
            )}
          </For>
        </div>
      </Show>
    </PageContainer>
  );
};

export default TheatresPage;
