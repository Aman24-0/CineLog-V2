// src/features/details/components/SimilarTitles.tsx
import { normalizeGenres } from "~/shared/utils/genres";
import { For, Show, createResource, createMemo, Component } from "solid-js";

import { tmdbImage } from "~/core/tmdb/tmdb";

import { getRecommendations } from "~/core/tmdb/discover";

import { isInVault } from "~/shared/utils/vaultMatch";

import { SafeImage } from "~/shared/ui";

import DetailSection from "./DetailSection";

import type { WatchlistItem, TMDBTitle } from "~/shared/types";


interface SimilarTitlesProps {
  /** The currently-open title — used to fetch TMDB recommendations */
  currentItem: WatchlistItem;
  /** The user's vault — used to mark which recommendations are already owned */
  watchlist: WatchlistItem[];
  /** Called when the user taps a recommendation — opens its Details */
  onSelect: (item: WatchlistItem) => void;
}

/**
 * SimilarTitles — "You May Also Like" rail.
 *
 * ARCHITECTURE:
 *   Fetches TMDB `/recommendations` for the current title (both movies and
 *   TV). This is the SAME source Netflix uses — TMDB's recommendation
 *   engine, not the user's vault.
 *
 *   Previously this component filtered `props.watchlist` by shared
 *   genres/platforms — which showed titles the user ALREADY owned. That
 *   defeated the purpose of a "You May Also Like" section.
 *
 *   Now it calls `getRecommendations(mediaType, id)` which hits TMDB's
 *   recommendation endpoint. Results are:
 *     1. Filtered to exclude the current title (by id AND media_type)
 *     2. Filtered to exclude titles already in the vault (vault-aware)
 *     3. Limited to 12 for the horizontal carousel
 *
 *   Vault titles that DO appear (e.g. if the user has many recommendations
 *   in their vault) are visually marked with a subtle accent dot so the
 *   user can distinguish "new" from "already in vault".
 *
 *   The resource is lazy — it only fetches when the component mounts
 *   (which happens when the Details modal's content area renders).
 */
const SimilarTitles: Component<SimilarTitlesProps> = (props) => {
  // Fetch TMDB recommendations for the current title.
  // The resource key is the current item's id + media_type so it
  // refetches when the user navigates to a different title.
  const source = createMemo(() => ({
    id: String(props.currentItem.id),
    mediaType: props.currentItem.media_type,
    key: `${props.currentItem.media_type}/${props.currentItem.id}`
  }));

  const [recommendations] = createResource(source, async (src) => {
    if (!src.id || !src.mediaType) return [];
    try {
      return await getRecommendations(src.mediaType, src.id);
    } catch (err) {
      console.warn("Failed to fetch recommendations:", err);
      return [];
    }
  });

  // Filter out the current title and vault titles, take 12
  const similar = createMemo(() => {
    const recs = recommendations();
    if (!recs || recs.length === 0) return [];

    return recs
      .filter((t) => {
        // Exclude the current title (by id AND media_type — TMDB ID namespace safety)
        if (String(t.id) === String(props.currentItem.id) &&
            t.media_type === props.currentItem.media_type) return false;
        return true;
      })
      .slice(0, 12);
  });

  // Convert a TMDBTitle to a minimal WatchlistItem for the onSelect handler
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
      genresList: normalizeGenres(title.genres as unknown[]),
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
      <DetailSection label="You May Also Like" icon="recommend">
        <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-1 px-1" role="list">
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
                    src={t.poster_path || t.backdrop_path ? tmdbImage(t.poster_path || t.backdrop_path, "w185") : ""}
                    alt=""
                    class="similar-title-poster-img"
                    fallback={
                      <div class="similar-title-poster-fallback" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{"font-size":"28px","color":"var(--text-dim)"}} aria-hidden="true">movie</span>
                      </div>
                    }
                  />
                  {/* Vault indicator dot — subtle accent if the title is already in the vault */}
                  <Show when={isInVault(props.watchlist, t)}>
                    <span class="similar-title-vault-dot" aria-label="In your watchlist" />
                  </Show>
                </div>
                <p class="similar-title-name">{titleOf(t)}</p>
                <p class="similar-title-meta">
                  {yearOf(t) ? `${yearOf(t)} · ` : ""}
                  {t.media_type === "tv" ? "Series" : "Movie"}
                  <Show when={imdbOf(t)}>
                    {" · "}<span style={{"color":"#f5c518"}}>★ {imdbOf(t)}</span>
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

export default SimilarTitles;
