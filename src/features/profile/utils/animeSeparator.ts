import { isAnimeByHeuristics } from "~/core/anime/detector";
import type { WatchlistItem } from "~/shared/types";

export interface SeparatedStats {
  movieCount: number;
  seriesCount: number;
  animeCount: number;
  movieRuntime: number;
  seriesRuntime: number;
  animeRuntime: number;
}

/**
 * Anime is explicitly classified from the hydrated genre names first. The
 * existing synchronous detector is also used as a fallback for older vault
 * records that may not have a complete `genresList` cache yet.
 */
export function isAnimeWatchlistItem(item: WatchlistItem): boolean {
  const genres = Array.isArray(item.genresList) ? item.genresList : [];
  const hasAnimeGenre = genres.some((genre) => {
    const normalized = genre.trim().toLowerCase();
    return normalized.includes("anime") || normalized.includes("animation");
  });

  if (hasAnimeGenre) return true;

  return isAnimeByHeuristics({
    origin_country: item.origin_country,
    spoken_languages: item.spoken_languages,
    title: item.title,
    name: item.name
  });
}

function runtimeInSeconds(item: WatchlistItem): number {
  const runtimeMinutes =
    typeof item.runtime === "number" && Number.isFinite(item.runtime)
      ? item.runtime
      : 0;
  return Math.max(0, Math.round(runtimeMinutes * 60));
}

/**
 * Split the user's vault into actual movies, actual series, and anime, then
 * return counts and runtime totals in seconds for the interactive formatter.
 */
export function calculateSeparatedStats(
  titles: WatchlistItem[]
): SeparatedStats {
  const movieTitles: WatchlistItem[] = [];
  const seriesTitles: WatchlistItem[] = [];
  const animeTitles: WatchlistItem[] = [];

  for (const title of titles) {
    const anime = isAnimeWatchlistItem(title);
    if (anime) {
      animeTitles.push(title);
    } else if (title.media_type === "movie") {
      movieTitles.push(title);
    } else {
      seriesTitles.push(title);
    }
  }

  const totalRuntime = (items: WatchlistItem[]) =>
    items.reduce((total, item) => total + runtimeInSeconds(item), 0);

  return {
    movieCount: movieTitles.length,
    seriesCount: seriesTitles.length,
    animeCount: animeTitles.length,
    movieRuntime: totalRuntime(movieTitles),
    seriesRuntime: totalRuntime(seriesTitles),
    animeRuntime: totalRuntime(animeTitles)
  };
}
