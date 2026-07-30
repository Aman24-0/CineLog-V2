/**
 * CineLog V2 — Genre Normalization Utility
 * ---------------------------------------------------------------------
 * TMDB returns genres in multiple formats depending on the endpoint:
 *
 *   • /search/movie and /search/tv → genres as string[] (names only)
 *   • /movie/{id} and /tv/{id}     → genres as { id, name }[] (objects)
 *   • /discover/movie               → genre_ids as number[] (IDs only)
 *
 * The WatchlistItem.genresList field is typed as string[] but at runtime
 * it may contain objects, numbers, or strings depending on the source.
 * This utility normalizes all formats to a clean string[] of genre names.
 *
 * Without this normalization, calling .toLowerCase() on a genre item
 * throws "s.toLowerCase is not a function" because the item is an
 * object ({ id: 28, name: "Action" }) not a string.
 */

// ---------------------------------------------------------------------------
// Types — the actual runtime shapes TMDB returns
// ---------------------------------------------------------------------------

/** TMDB genre object from the /movie/{id} and /tv/{id} endpoints. */
interface TMDBGenreObject {
  id: number;
  name: string;
}

/** Any possible genre format from TMDB or internal code. */
type GenreItem = string | number | TMDBGenreObject | null | undefined;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a single genre item to a string (the genre name).
 *
 * Handles all TMDB formats:
 *   • "Action"              → "Action"
 *   • 28                    → "28" (fallback — ID without a name map)
 *   • { id: 28, name: "Action" } → "Action"
 *   • null / undefined      → "" (filtered out)
 */
export function normalizeGenre(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string") return item.trim();
  if (typeof item === "number") return String(item);
  if (
    typeof item === "object" &&
    item !== null &&
    "name" in item &&
    typeof (item as { name: unknown }).name === "string"
  ) {
    return (item as { name: string }).name.trim();
  }
  // Unknown format — stringify as fallback so we never throw
  return String(item).trim();
}

/**
 * Normalize an array of genre items to a clean string[] of genre names.
 *
 * Filters out empty strings and nullish values. Deduplicates.
 *
 * @param genres The raw genres array from TMDB or internal code. Accepts
 *   unknown[] because TMDB returns different shapes at runtime than what
 *   TypeScript types declare (objects vs strings).
 * @returns A clean string[] of genre names (e.g. ["Action", "Sci-Fi"]).
 */
export function normalizeGenres(
  genres: unknown[] | null | undefined
): string[] {
  if (!genres || !Array.isArray(genres)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const g of genres) {
    const name = normalizeGenre(g as GenreItem);
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * Check if a watchlist item's genres include a genre matching the
 * given substring (case-insensitive).
 *
 * This is the SAFE replacement for:
 *   m.genresList?.some((g) => g.toLowerCase().includes("sci"))
 *
 * It normalizes each genre item before comparing, so it works
 * regardless of whether genresList contains strings, objects, or
 * numbers.
 *
 * @param item The watchlist item.
 * @param substr The substring to search for (case-insensitive).
 * @returns true if any genre contains the substring.
 */
export function hasGenre(
  item: { genresList?: unknown },
  substr: string
): boolean {
  if (!item?.genresList || !Array.isArray(item.genresList)) return false;
  const lower = substr.toLowerCase();
  return (item.genresList as unknown[]).some((g) => {
    const name = normalizeGenre(g);
    return name.toLowerCase().includes(lower);
  });
}

/**
 * Get all unique genres from a list of watchlist items.
 *
 * @param items The watchlist items.
 * @returns A deduplicated string[] of genre names.
 */
export function collectGenres(items: { genresList?: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.genresList || !Array.isArray(item.genresList)) continue;
    for (const g of item.genresList as unknown[]) {
      const name = normalizeGenre(g);
      if (name) seen.add(name);
    }
  }
  return Array.from(seen);
}
