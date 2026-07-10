// src/core/tmdb/genres.ts
/**
 * TMDB genre maps + helpers.
 *
 * Extracted from discover.ts to keep that file under the 250-line limit.
 * Inlined genre maps let discover cards render genre names without a
 * second round-trip to the TMDB /genre endpoint.
 */

/** TMDB movie genre IDs → names. */
export const MOVIE_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
};

/** TMDB TV genre IDs → names. */
export const TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  10762: "Kids", 9648: "Mystery", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk",
  10768: "War & Politics", 37: "Western",
};

/** Resolve an array of genre IDs to genre names for the given media type. */
export function resolveGenres(
  ids: number[] | undefined,
  mediaType: "movie" | "tv",
): string[] {
  if (!ids || ids.length === 0) return [];
  const map = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  return ids.map((id) => map[id]).filter(Boolean);
}

/** Genre ID helpers — callers pass genre names, we resolve to IDs. */
export const GENRE_ID = {
  movie: MOVIE_GENRES,
  tv: TV_GENRES,
} as const;

/**
 * Reverse lookup: genre name → ID, for the user's preferred media type.
 *
 * Supports common aliases (e.g. "Sci-Fi" ↔ "Science Fiction") so callers
 * can pass either form.
 */
export function genreIdFor(
  name: string,
  mediaType: "movie" | "tv",
): number | undefined {
  const map = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  for (const [id, n] of Object.entries(map)) {
    if (n.toLowerCase() === name.toLowerCase()) return Number(id);
  }
  // Common-name fallbacks so "Sci-Fi" resolves even if the user
  // stored "Science Fiction"
  const aliases: Record<string, string> = {
    "sci-fi": "Sci-Fi",
    "science fiction": "Sci-Fi",
    "scifi": "Sci-Fi",
    "action & adventure": "Action & Adventure",
  };
  const alias = aliases[name.toLowerCase()];
  if (alias) {
    for (const [id, n] of Object.entries(map)) {
      if (n === alias) return Number(id);
    }
  }
  return undefined;
}
