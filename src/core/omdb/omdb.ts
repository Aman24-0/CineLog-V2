// src/core/omdb/omdb.ts
import type { OMDbRatings } from "~/shared/types";
import { cachedFetch, buildCacheKey, OMDb_TTL } from "~/shared/utils/apiCache";

export const OMDB_KEY = import.meta.env.VITE_OMDB_API_KEY;

/** OMDb API rating entry shape */
interface OMDbRatingEntry {
  Source: string;
  Value: string;
}

/** OMDb API response shape (subset of fields we use) */
interface OMDbResponse {
  Response: string;
  Ratings?: OMDbRatingEntry[];
  imdbRating?: string;
  Director?: string;
  Actors?: string;
  Writer?: string;
  Plot?: string;
  Rated?: string;
  Year?: string;
  Runtime?: string;
}

export const fetchOmdbRatings = async (
  title: string,
  imdbId?: string | null
): Promise<OMDbRatings | null> => {
  if (!title && !imdbId) return null;
  // Prefer IMDb ID lookup (?i=) over title (?t=) — title search can
  // match the wrong movie when multiple films share a title (e.g. "Dune").
  const cacheKey = imdbId
    ? buildCacheKey("omdb:ratings", { imdbId })
    : buildCacheKey("omdb:ratings", { title });
  try {
    const data = await cachedFetch<OMDbResponse>(
      cacheKey,
      OMDb_TTL,
      async () => {
        const queryParam = imdbId
          ? `i=${encodeURIComponent(imdbId)}`
          : `t=${encodeURIComponent(title)}`;
        const res = await fetch(
          `https://www.omdbapi.com/?${queryParam}&apikey=${OMDB_KEY}`
        );
        if (!res.ok) return { Response: "False" } as OMDbResponse;
        return res.json() as Promise<OMDbResponse>;
      }
    );
    if (data.Response === "True") {
      const rt = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value || "-";
      return {
        imdb: data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : "-",
        rt,
        director: data.Director && data.Director !== "N/A" ? data.Director : undefined,
        actors: data.Actors && data.Actors !== "N/A" ? data.Actors : undefined,
        writer: data.Writer && data.Writer !== "N/A" ? data.Writer : undefined,
        plot: data.Plot && data.Plot !== "N/A" ? data.Plot : undefined,
        rated: data.Rated && data.Rated !== "N/A" ? data.Rated : undefined,
        year: data.Year && data.Year !== "N/A" ? data.Year : undefined,
        runtime: data.Runtime && data.Runtime !== "N/A" ? data.Runtime : undefined
      };
    }
    return null;
  } catch {
    return null;
  }
};
