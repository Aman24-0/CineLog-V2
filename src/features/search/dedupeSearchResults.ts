// src/features/search/dedupeSearchResults.ts
//
// Collapse TMDB movie/series duplicates before they reach the UI.
//
// THE BUG THIS FIXES
// ------------------
// TMDB keeps TWO namespaces for titles: `movie` and `tv`. For announced or
// newly released shows, contributors routinely create a *movie* entry that
// duplicates the real *tv* entry (same title, same release date, often no
// poster and no vote count). `/search/multi` happily returns both, so a
// search for "Lanterns" (an HBO series, tv/95350) also returns a
// movie-namespaced twin. Users tap the movie row, it lands in the vault as
// `movie/<id>`, and later TMDB deletes/merges that duplicate — leaving an
// orphan vault row that 404s forever ("Movie not found" + no poster).
//
// THE RULE
// --------
// A movie result is dropped when a series result exists with the same
// normalised title AND the movie either has no release date or shares the
// series' premiere year. A real film that shares a name with a show
// (e.g. "Fargo" 1996 vs "Fargo" 2014) has a different year, so it survives.
// Exact movie/movie and series/series duplicates (same title + same year)
// are also collapsed, keeping the healthier row.
//
// The function is pure so it can be unit-tested without any TMDB calls.

import type { TMDBTitle } from "~/shared/types";

/** Normalise a title for comparison: lowercase, strip punctuation/diacritics. */
export function normalizeTitleKey(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Release/premiere year as a string, or "" when TMDB has no date. */
export function titleYearOf(title: TMDBTitle): string {
  return (title.release_date || title.first_air_date || "").slice(0, 4);
}

/**
 * "Health" score used to pick the survivor of an exact duplicate pair.
 * A row with a poster and real votes is the one users can actually see.
 */
function healthScore(title: TMDBTitle): number {
  let score = 0;
  if (title.poster_path) score += 2;
  if ((title.vote_count ?? 0) > 0) score += 2;
  if (titleYearOf(title)) score += 1;
  if (title.overview) score += 1;
  return score;
}

function pickHealthier(a: TMDBTitle, b: TMDBTitle): TMDBTitle {
  return healthScore(b) > healthScore(a) ? b : a;
}

/** Collapse exact duplicates inside a single list (same title + same year). */
function dedupeWithin(list: TMDBTitle[]): TMDBTitle[] {
  const byKey = new Map<string, TMDBTitle>();
  const out: TMDBTitle[] = [];
  for (const title of list) {
    const key = `${normalizeTitleKey(title.title || title.name)}|${titleYearOf(title)}`;
    if (!key.startsWith("|")) {
      const existing = byKey.get(key);
      if (existing) {
        // Replace in place with the healthier of the two.
        const winner = pickHealthier(existing, title);
        if (winner !== existing) {
          byKey.set(key, winner);
          const idx = out.indexOf(existing);
          if (idx >= 0) out[idx] = winner;
        }
        continue;
      }
      byKey.set(key, title);
    }
    out.push(title);
  }
  return out;
}

export interface DedupeResult {
  movies: TMDBTitle[];
  series: TMDBTitle[];
  /** How many results were dropped as duplicates (for tests / logging). */
  removed: number;
}

/**
 * Remove movie-namespaced twins of series results, then collapse exact
 * duplicates within each list.
 */
export function collapseDuplicateMediaTypes(
  movies: TMDBTitle[],
  series: TMDBTitle[]
): DedupeResult {
  // Index the series by normalised title → set of years.
  const seriesByTitle = new Map<string, TMDBTitle[]>();
  for (const show of series) {
    const key = normalizeTitleKey(show.title || show.name);
    if (!key) continue;
    const bucket = seriesByTitle.get(key);
    if (bucket) bucket.push(show);
    else seriesByTitle.set(key, [show]);
  }

  const keptMovies: TMDBTitle[] = [];
  let removed = 0;

  for (const movie of movies) {
    const key = normalizeTitleKey(movie.title || movie.name);
    const twins = key ? seriesByTitle.get(key) : undefined;
    if (!twins || twins.length === 0) {
      keptMovies.push(movie);
      continue;
    }
    const movieYear = titleYearOf(movie);
    // A missing release date is the classic signature of a placeholder
    // movie entry created for a show. Same-year is a straight duplicate.
    const isDuplicate = twins.some((show) => {
      const showYear = titleYearOf(show);
      return !movieYear || !showYear || movieYear === showYear;
    });
    if (isDuplicate) removed += 1;
    else keptMovies.push(movie);
  }

  const dedupedMovies = dedupeWithin(keptMovies);
  const dedupedSeries = dedupeWithin(series);
  removed +=
    keptMovies.length - dedupedMovies.length + (series.length - dedupedSeries.length);

  return { movies: dedupedMovies, series: dedupedSeries, removed };
}
