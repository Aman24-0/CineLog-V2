// src/core/tmdb/tmdb.ts
import type { TMDBDetails } from "~/shared/types";

export const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;

export const fetchTmdbDetails = async (
  mediaType: string,
  id: string
): Promise<TMDBDetails> => {
  const res = await fetch(
    `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_KEY}&language=en-US`
  );
  if (!res.ok) throw new Error("Failed to fetch TMDB details");
  return res.json();
};
