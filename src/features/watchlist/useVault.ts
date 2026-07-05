// src/features/watchlist/useVault.ts
import { createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

// Temporary mock data to unblock development until Firestore is wired up
const MOCK_VAULT: WatchlistItem[] = [
  {
    id: "1",
    title: "The Dark Knight",
    media_type: "movie",
    poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    backdrop_path: "/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg",
    status: "Completed",
    rating: 10,
    watchDate: "2023-10-26",
    runtime: 152,
    genresList: ["Action", "Crime", "Drama"],
    platformsList: ["Netflix"],
    tag: "Rewatch",
    imdbRating: "9.0",
    rtRating: "94%",
    release_date: "2008-07-16",
    addedAt: new Date("2023-10-26T00:00:00Z")
  },
  {
    id: "2",
    title: "Breaking Bad",
    name: "Breaking Bad",
    media_type: "tv",
    poster_path: "/ggFHVNu6YYI5L9pCfOacj7RGK.jpg",
    backdrop_path: "/tsRy63Mu5cu022ZQF6AIjc8MQBh.jpg",
    status: "Completed",
    rating: 9.5,
    watchDate: "2023-11-02",
    runtime: 45,
    genresList: ["Crime", "Drama", "Thriller"],
    platformsList: ["Netflix"],
    imdbRating: "9.5",
    rtRating: "96%",
    release_date: "2008-01-20",
    addedAt: new Date("2023-11-02T00:00:00Z")
  },
  {
    id: "3",
    title: "Interstellar",
    media_type: "movie",
    poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    backdrop_path: "/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
    status: "Planned",
    runtime: 169,
    genresList: ["Adventure", "Drama", "Sci-Fi"],
    platformsList: ["Amazon Prime Video"],
    imdbRating: "8.7",
    rtRating: "73%",
    release_date: "2014-11-05",
    addedAt: new Date("2023-11-05T00:00:00Z")
  },
  {
    id: "4",
    title: "The Office",
    name: "The Office",
    media_type: "tv",
    poster_path: "/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg",
    backdrop_path: "/7VyfqJ58fafSPma1u2MP9tQqyyO.jpg",
    status: "Watching",
    rating: 9,
    watchDate: "2023-11-10",
    runtime: 30,
    genresList: ["Comedy"],
    platformsList: ["Amazon Prime Video"],
    season: 3,
    episode: 5,
    imdbRating: "9.0",
    rtRating: "90%",
    release_date: "2005-03-24",
    addedAt: new Date("2023-11-10T00:00:00Z")
  }
];

export function useVault() {
  const [watchlist] = createSignal<WatchlistItem[]>(MOCK_VAULT);
  const [loading] = createSignal(false);

  return {
    watchlist,
    loading
  };
}
