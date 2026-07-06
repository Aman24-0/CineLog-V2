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
      const rt = data.Ratings?.find((r: any) => r.Source === "Rotten Tomatoes")?.Value || "-";
      return {
        imdb: data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : "-",
        rt,
        // Extra metadata for the details page (all optional, may be "N/A")
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
  } catch (e) {
    return null;
  }
};
