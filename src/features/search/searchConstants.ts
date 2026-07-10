// src/features/search/searchConstants.ts
/**
 * Genre pills for the cold-start "browse by genre" grid.
 * These map to TMDB movie genre IDs via the discover API's genreIdFor.
 */
export const GENRE_PILLS: { label: string; icon: string }[] = [
  { label: "Sci-Fi", icon: "rocket_launch" },
  { label: "Drama", icon: "theater_comedy" },
  { label: "Thriller", icon: "psychology" },
  { label: "Action", icon: "bolt" },
  { label: "Comedy", icon: "sentiment_very_satisfied" },
  { label: "Horror", icon: "ghost" },
  { label: "Romance", icon: "favorite" },
  { label: "Documentary", icon: "movie" },
];

/** Shared helpers for displaying TMDB titles. */
export const titleOf = (t: { title?: string; name?: string }) =>
  t.title || t.name || "Untitled";

export const yearOf = (t: {
  release_date?: string;
  first_air_date?: string;
}) => (t.release_date || t.first_air_date || "").split("-")[0] || "";

export const imdbOf = (t: { vote_average?: number }) =>
  t.vote_average ? t.vote_average.toFixed(1) : null;
