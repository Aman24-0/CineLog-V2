// src/features/details/DetailsModal/AnimeRecommendations.tsx
//
// AnimeRecommendations — "More Anime Like This" rail.
// ---------------------------------------------------------------------
// Phase 6 — uses AniList's recommendation graph instead of TMDB's.
// Rendered ONLY for anime titles (when the parent has an anilistId).
// Falls back silently if no recommendations or no TMDB mappings.
//
// PIPELINE:
//   1. Calls getAnimeRecommendations(anilistId) — fetches AniList recs,
//      maps back to TMDB ids, fetches TMDB metadata.
//   2. Filters out the current title (by TMDB id).
//   3. Renders a horizontal rail using the same .similar-title-card
//      CSS as SimilarTitles so the visual language is identical.

import { For, Show, createResource, createMemo, type Component } from "solid-js";
import type { Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { isInVault } from "~/shared/utils/vaultMatch";
import { normalizeGenres } from "~/shared/utils/genres";
import { SafeImage } from "~/shared/ui";
import DetailSection from "~/features/details/components/DetailSection";
import { getAnimeRecommendations } from "~/features/details/animeRecommendations";
import type { WatchlistItem, TMDBTitle } from "~/shared/types";

interface AnimeRecommendationsProps {
  /** The AniList id of the currently-open title. */
  anilistId: Accessor<number | null>;
  /** The currently-open TMDB title — used to exclude it from the recs. */
  currentTmdbId: Accessor<string | number | undefined>;
  /** The user's vault — used to mark which recs are already owned. */
  watchlist: Accessor<WatchlistItem[]>;
  /** Called when the user taps a recommendation — opens its Details. */
  onSelect: (item: WatchlistItem) => void;
}

const AnimeRecommendations: Component<AnimeRecommendationsProps> = (props) => {
  const source = createMemo(() => ({
    anilistId: props.anilistId(),
    currentTmdbId: String(props.currentTmdbId() ?? "")
  }));

  const [recs] = createResource(source, async (src) => {
    if (!src.anilistId || src.anilistId <= 0) return [];
    try {
      return await getAnimeRecommendations(src.anilistId, 12);
    } catch (err) {
      console.warn("[AnimeRecommendations] fetch failed:", err);
      return [];
    }
  });

  // Filter out the current title.
  const similar = createMemo(() => {
    const list = recs();
    if (!list || list.length === 0) return [];
    const currentId = String(props.currentTmdbId() ?? "");
    return list.filter((t) => String(t.id) !== currentId).slice(0, 12);
  });

  const handleSelect = (title: TMDBTitle) => {
    const item: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned",
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: normalizeGenres(title.genres as unknown[])
    };
    props.onSelect(item);
  };

  const titleOf = (t: TMDBTitle) => t.title || t.name || "Untitled";
  const yearOf = (t: TMDBTitle) =>
    (t.release_date || t.first_air_date || "").split("-")[0] || "";
  const imdbOf = (t: TMDBTitle) =>
    t.vote_average ? t.vote_average.toFixed(1) : null;

  return (
    <Show when={similar().length > 0}>
      <DetailSection label="More Anime Like This" icon="recommend">
        <div
          class="hide-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2"
          role="list"
        >
          <For each={similar()}>
            {(t) => (
              <div
                class="similar-title-card"
                role="listitem"
                onClick={() => handleSelect(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(t);
                  }
                }}
                tabindex={0}
                aria-label={`${titleOf(t)}${yearOf(t) ? `, ${yearOf(t)}` : ""} — open details`}
              >
                <div class="similar-title-poster">
                  <SafeImage
                    src={
                      t.poster_path || t.backdrop_path
                        ? tmdbImage(t.poster_path || t.backdrop_path, "w185")
                        : ""
                    }
                    alt=""
                    class="similar-title-poster-img"
                    fallback={
                      <div
                        class="similar-title-poster-fallback"
                        aria-hidden="true"
                      >
                        <span
                          class="material-symbols-outlined"
                          style={{
                            "font-size": "28px",
                            color: "var(--text-dim)"
                          }}
                          aria-hidden="true"
                        >
                          movie
                        </span>
                      </div>
                    }
                  />
                  <Show when={isInVault(props.watchlist(), t)}>
                    <span
                      class="similar-title-vault-dot"
                      aria-label="In your watchlist"
                    />
                  </Show>
                </div>
                <p class="similar-title-name">{titleOf(t)}</p>
                <p class="similar-title-meta">
                  {yearOf(t) ? `${yearOf(t)} · ` : ""}
                  {t.media_type === "tv" ? "Series" : "Movie"}
                  <Show when={imdbOf(t)}>
                    {" · "}
                    <span style={{ color: "#f5c518" }}>★ {imdbOf(t)}</span>
                  </Show>
                </p>
              </div>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
};

export default AnimeRecommendations;
