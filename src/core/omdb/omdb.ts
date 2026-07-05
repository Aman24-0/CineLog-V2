// src/core/omdb/omdb.ts
import type { OMDbRatings } from "~/shared/types";

export const OMDB_KEY = import.meta.env.VITE_OMDB_API_KEY;

export const fetchOmdbRatings = async (title: string): Promise<OMDbRatings | null> => {
  if (!title) return null;
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Response === "True") {
      return {
        imdb: data.imdbRating || "-",
        rt:
          data.Ratings?.find((r: any) => r.Source === "Rotten Tomatoes")
            ?.Value || "-"
      };
    }
    return null;
  } catch (e) {
    return null;
  }
};
