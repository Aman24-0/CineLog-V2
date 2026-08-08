// ---------------------------------------------------------------------------
// CineLog V2 — Landing Page Demo Content
// Static data for a PUBLIC MARKETING LANDING PAGE — no API calls, no auth.
// All content is purely decorative / illustrative.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface DemoTitle {
  title: string;
  year: number;
  type: "movie" | "tv" | "anime";
  rating: number;
  genres: string[];
  posterPath: string;
}

export interface DemoSpotlight {
  title: string;
  year: number;
  tagline: string;
  rating: number;
  genres: string[];
  posterPath: string;
  backdropPath: string;
}

export interface DemoVaultItem extends DemoTitle {
  status: "watching" | "completed" | "planned" | "dropped";
  episodeProgress?: { current: number; total: number };
}

export interface DemoStats {
  totalTitles: number;
  totalHours: number;
  avgRating: number;
  completed: number;
  topGenres: string[];
  moviesVsSeries: { movies: number; series: number };
}

export interface DemoFranchise {
  name: string;
  phases: { name: string; years: string; titles: string[] }[];
}

export interface DemoUpcoming {
  title: string;
  date: string;
  type: "movie" | "tv" | "anime";
  posterPath: string;
}

export interface ImportSource {
  name: string;
  icon: string;
  description: string;
}

export interface DemoStat {
  value: string;
  label: string;
  icon: string;
}

export interface DemoGenreBar {
  genre: string;
  percent: number;
}

export type WatchStatus = "watching" | "completed" | "planned" | "dropped";

// ---------------------------------------------------------------------------
// DEMO_MOVIES (16 titles)
// ---------------------------------------------------------------------------

export const DEMO_MOVIES: readonly DemoTitle[] = [
  {
    title: "Inception",
    year: 2010,
    type: "movie",
    rating: 8.8,
    genres: ["Sci-Fi", "Action", "Thriller"],
    posterPath: "/ljsnlTgGWIjpJkM9pNwVRXgOSkC.jpg",
  },
  {
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    rating: 9.0,
    genres: ["Action", "Crime", "Drama"],
    posterPath: "/qJ2t4NwMDM7hHO9jQ3W5JmQ4W5R2.jpg",
  },
  {
    title: "Interstellar",
    year: 2014,
    type: "movie",
    rating: 8.7,
    genres: ["Sci-Fi", "Drama", "Adventure"],
    posterPath: "/gEU2Qti3QKJ6VNcLh2v7mR4f7fV2.jpg",
  },
  {
    title: "Parasite",
    year: 2019,
    type: "movie",
    rating: 8.5,
    genres: ["Thriller", "Drama", "Comedy"],
    posterPath: "/7IiQgUk9NQo1Rq8h1h1W9l1b1l1.jpg",
  },
  {
    title: "Dune",
    year: 2021,
    type: "movie",
    rating: 8.0,
    genres: ["Sci-Fi", "Adventure", "Drama"],
    posterPath: "/d5NXV5hUbHlQJRmC5P3XkZ5Z5Z5.jpg",
  },
  {
    title: "The Shawshank Redemption",
    year: 1994,
    type: "movie",
    rating: 9.3,
    genres: ["Drama"],
    posterPath: "/q6L0J3R2l2l1m1p1R3r1Q1L2k3.jpg",
  },
  {
    title: "Pulp Fiction",
    year: 1994,
    type: "movie",
    rating: 8.9,
    genres: ["Crime", "Drama"],
    posterPath: "/dA1pl6j2t6iJ2r1Q0R3t1e3W1.jpg",
  },
  {
    title: "The Matrix",
    year: 1999,
    type: "movie",
    rating: 8.7,
    genres: ["Sci-Fi", "Action"],
    posterPath: "/f4Q0Q3f3h3e3T3r1R1p1W1e3.jpg",
  },
  {
    title: "Blade Runner 2049",
    year: 2017,
    type: "movie",
    rating: 8.0,
    genres: ["Sci-Fi", "Drama", "Mystery"],
    posterPath: "/b1R2V3s3e3f3A1m1p1Q1W1e3.jpg",
  },
  {
    title: "Mad Max: Fury Road",
    year: 2015,
    type: "movie",
    rating: 8.1,
    genres: ["Action", "Adventure", "Sci-Fi"],
    posterPath: "/8t3t1R3h3e3T1r1p1Q1W1e3.jpg",
  },
  {
    title: "Spirited Away",
    year: 2001,
    type: "movie",
    rating: 8.6,
    genres: ["Animation", "Adventure", "Fantasy"],
    posterPath: "",
  },
  {
    title: "Whiplash",
    year: 2014,
    type: "movie",
    rating: 8.5,
    genres: ["Drama", "Music"],
    posterPath: "",
  },
  {
    title: "The Grand Budapest Hotel",
    year: 2014,
    type: "movie",
    rating: 8.1,
    genres: ["Comedy", "Drama", "Adventure"],
    posterPath: "",
  },
  {
    title: "Arrival",
    year: 2016,
    type: "movie",
    rating: 7.9,
    genres: ["Sci-Fi", "Drama", "Mystery"],
    posterPath: "",
  },
  {
    title: "Everything Everywhere All at Once",
    year: 2022,
    type: "movie",
    rating: 7.8,
    genres: ["Action", "Adventure", "Comedy"],
    posterPath: "",
  },
  {
    title: "Oppenheimer",
    year: 2023,
    type: "movie",
    rating: 8.3,
    genres: ["Drama", "History", "Biography"],
    posterPath: "",
  },
] as const;

// ---------------------------------------------------------------------------
// DEMO_TV_SHOWS (8 titles)
// ---------------------------------------------------------------------------

export const DEMO_TV_SHOWS: readonly DemoTitle[] = [
  {
    title: "Breaking Bad",
    year: 2008,
    type: "tv",
    rating: 9.5,
    genres: ["Crime", "Drama", "Thriller"],
    posterPath: "/ztkUQ_fl6B1l2l1p1R3r1Q1L2k3.jpg",
  },
  {
    title: "Game of Thrones",
    year: 2011,
    type: "tv",
    rating: 9.2,
    genres: ["Fantasy", "Drama", "Action"],
    posterPath: "/7Wj2Q3f3h3e3T3r1R1p1W1e3.jpg",
  },
  {
    title: "Stranger Things",
    year: 2016,
    type: "tv",
    rating: 8.7,
    genres: ["Sci-Fi", "Horror", "Drama"],
    posterPath: "",
  },
  {
    title: "The Crown",
    year: 2016,
    type: "tv",
    rating: 8.3,
    genres: ["Drama", "History", "Biography"],
    posterPath: "",
  },
  {
    title: "Chernobyl",
    year: 2019,
    type: "tv",
    rating: 9.4,
    genres: ["Drama", "History"],
    posterPath: "",
  },
  {
    title: "The Last of Us",
    year: 2023,
    type: "tv",
    rating: 8.8,
    genres: ["Drama", "Action", "Horror"],
    posterPath: "",
  },
  {
    title: "Severance",
    year: 2022,
    type: "tv",
    rating: 8.7,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "",
  },
  {
    title: "Shōgun",
    year: 2024,
    type: "tv",
    rating: 8.6,
    genres: ["Drama", "History", "War"],
    posterPath: "",
  },
] as const;

// ---------------------------------------------------------------------------
// DEMO_ANIME (8 titles)
// ---------------------------------------------------------------------------

export const DEMO_ANIME: readonly DemoTitle[] = [
  {
    title: "Attack on Titan",
    year: 2013,
    type: "anime",
    rating: 9.0,
    genres: ["Action", "Drama", "Fantasy"],
    posterPath: "/hTPN3R1Q3m3e3T3r1R1p1W1e3.jpg",
  },
  {
    title: "Demon Slayer",
    year: 2019,
    type: "anime",
    rating: 8.5,
    genres: ["Action", "Fantasy", "Adventure"],
    posterPath: "/xUHJ3R1Q3m3e3T3r1R1p1W1e3.jpg",
  },
  {
    title: "One Piece",
    year: 1999,
    type: "anime",
    rating: 8.7,
    genres: ["Action", "Adventure", "Comedy"],
    posterPath: "/cMDN3R1Q3m3e3T3r1R1p1W1e3.jpg",
  },
  {
    title: "Fullmetal Alchemist: Brotherhood",
    year: 2009,
    type: "anime",
    rating: 9.1,
    genres: ["Action", "Adventure", "Fantasy"],
    posterPath: "",
  },
  {
    title: "Steins;Gate",
    year: 2011,
    type: "anime",
    rating: 8.8,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "",
  },
  {
    title: "Death Note",
    year: 2006,
    type: "anime",
    rating: 8.6,
    genres: ["Thriller", "Mystery", "Supernatural"],
    posterPath: "",
  },
  {
    title: "Cowboy Bebop",
    year: 1998,
    type: "anime",
    rating: 8.8,
    genres: ["Action", "Sci-Fi", "Drama"],
    posterPath: "",
  },
  {
    title: "Jujutsu Kaisen",
    year: 2020,
    type: "anime",
    rating: 8.4,
    genres: ["Action", "Supernatural", "Fantasy"],
    posterPath: "",
  },
] as const;

// ---------------------------------------------------------------------------
// DEMO_SPOTLIGHT — single hero / featured title
// ---------------------------------------------------------------------------

export const DEMO_SPOTLIGHT: DemoSpotlight = {
  title: "Dune: Part Two",
  year: 2024,
  tagline: "Long live the fighters",
  rating: 8.6,
  genres: ["Sci-Fi", "Adventure", "Drama"],
  posterPath: "",
  backdropPath: "",
} as const;

// ---------------------------------------------------------------------------
// DEMO_VAULT_ITEMS (12 items across all statuses)
// ---------------------------------------------------------------------------

export const DEMO_VAULT_ITEMS: readonly DemoVaultItem[] = [
  {
    title: "The Last of Us",
    year: 2023,
    type: "tv",
    rating: 8.8,
    genres: ["Drama", "Action", "Horror"],
    posterPath: "",
    status: "watching",
    episodeProgress: { current: 6, total: 9 },
  },
  {
    title: "Jujutsu Kaisen",
    year: 2020,
    type: "anime",
    rating: 8.4,
    genres: ["Action", "Supernatural", "Fantasy"],
    posterPath: "",
    status: "watching",
    episodeProgress: { current: 18, total: 24 },
  },
  {
    title: "Severance",
    year: 2022,
    type: "tv",
    rating: 8.7,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "",
    status: "watching",
    episodeProgress: { current: 3, total: 9 },
  },
  {
    title: "Breaking Bad",
    year: 2008,
    type: "tv",
    rating: 9.5,
    genres: ["Crime", "Drama", "Thriller"],
    posterPath: "/ztkUQ_fl6B1l2l1p1R3r1Q1L2k3.jpg",
    status: "completed",
  },
  {
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    rating: 9.0,
    genres: ["Action", "Crime", "Drama"],
    posterPath: "/qJ2t4NwMDM7hHO9jQ3W5JmQ4W5R2.jpg",
    status: "completed",
  },
  {
    title: "Parasite",
    year: 2019,
    type: "movie",
    rating: 8.5,
    genres: ["Thriller", "Drama", "Comedy"],
    posterPath: "/7IiQgUk9NQo1Rq8h1h1W9l1b1l1.jpg",
    status: "completed",
  },
  {
    title: "Fullmetal Alchemist: Brotherhood",
    year: 2009,
    type: "anime",
    rating: 9.1,
    genres: ["Action", "Adventure", "Fantasy"],
    posterPath: "",
    status: "completed",
  },
  {
    title: "Dune: Part Two",
    year: 2024,
    type: "movie",
    rating: 8.6,
    genres: ["Sci-Fi", "Adventure", "Drama"],
    posterPath: "",
    status: "planned",
  },
  {
    title: "Shōgun",
    year: 2024,
    type: "tv",
    rating: 8.6,
    genres: ["Drama", "History", "War"],
    posterPath: "",
    status: "planned",
  },
  {
    title: "Steins;Gate",
    year: 2011,
    type: "anime",
    rating: 8.8,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "",
    status: "planned",
  },
  {
    title: "The Crown",
    year: 2016,
    type: "tv",
    rating: 8.3,
    genres: ["Drama", "History", "Biography"],
    posterPath: "",
    status: "dropped",
  },
  {
    title: "Death Note",
    year: 2006,
    type: "anime",
    rating: 8.6,
    genres: ["Thriller", "Mystery", "Supernatural"],
    posterPath: "",
    status: "dropped",
  },
] as const;

// ---------------------------------------------------------------------------
// DEMO_STATS — aggregate overview
// ---------------------------------------------------------------------------

export const DEMO_STATS: DemoStats = {
  totalTitles: 247,
  totalHours: 1842,
  avgRating: 7.9,
  completed: 163,
  topGenres: ["Drama", "Action", "Sci-Fi", "Thriller", "Comedy", "Fantasy"],
  moviesVsSeries: { movies: 142, series: 105 },
} as const;

// ---------------------------------------------------------------------------
// DEMO_FRANCHISES (3 franchise timelines)
// ---------------------------------------------------------------------------

export const DEMO_FRANCHISES: readonly DemoFranchise[] = [
  {
    name: "Marvel Cinematic Universe",
    phases: [
      {
        name: "Phase 1",
        years: "2008–2012",
        titles: [
          "Iron Man",
          "The Incredible Hulk",
          "Thor",
          "Captain America: The First Avenger",
          "The Avengers",
        ],
      },
      {
        name: "Phase 2",
        years: "2013–2015",
        titles: [
          "Iron Man 3",
          "Thor: The Dark World",
          "Captain America: The Winter Soldier",
          "Guardians of the Galaxy",
          "Avengers: Age of Ultron",
          "Ant-Man",
        ],
      },
      {
        name: "Phase 3",
        years: "2016–2019",
        titles: [
          "Captain America: Civil War",
          "Doctor Strange",
          "Guardians of the Galaxy Vol. 2",
          "Spider-Man: Homecoming",
          "Thor: Ragnarok",
          "Black Panther",
          "Avengers: Infinity War",
          "Ant-Man and the Wasp",
          "Captain Marvel",
          "Avengers: Endgame",
          "Spider-Man: Far From Home",
        ],
      },
    ],
  },
  {
    name: "Star Wars",
    phases: [
      {
        name: "Original Trilogy",
        years: "1977–1983",
        titles: [
          "A New Hope",
          "The Empire Strikes Back",
          "Return of the Jedi",
        ],
      },
      {
        name: "Prequel Trilogy",
        years: "1999–2005",
        titles: [
          "The Phantom Menace",
          "Attack of the Clones",
          "Revenge of the Sith",
        ],
      },
      {
        name: "Sequel Trilogy",
        years: "2015–2019",
        titles: [
          "The Force Awakens",
          "The Last Jedi",
          "The Rise of Skywalker",
        ],
      },
    ],
  },
  {
    name: "The Lord of the Rings",
    phases: [
      {
        name: "The Lord of the Rings",
        years: "2001–2003",
        titles: [
          "The Fellowship of the Ring",
          "The Two Towers",
          "The Return of the King",
        ],
      },
      {
        name: "The Hobbit",
        years: "2012–2014",
        titles: [
          "An Unexpected Journey",
          "The Desolation of Smaug",
          "The Battle of the Five Armies",
        ],
      },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// DEMO_UPCOMING (6 upcoming releases)
// ---------------------------------------------------------------------------

export const DEMO_UPCOMING: readonly DemoUpcoming[] = [
  {
    title: "The Fantastic Four: First Steps",
    date: "2025-07-25",
    type: "movie",
    posterPath: "",
  },
  {
    title: "Thunderbolts*",
    date: "2025-05-02",
    type: "movie",
    posterPath: "",
  },
  {
    title: "One Piece Season 2",
    date: "2025-06-15",
    type: "anime",
    posterPath: "",
  },
  {
    title: "The Witcher S4",
    date: "2025-09-01",
    type: "tv",
    posterPath: "",
  },
  {
    title: "Mission: Impossible – The Final Reckoning",
    date: "2025-05-23",
    type: "movie",
    posterPath: "",
  },
  {
    title: "Chainsaw Man Season 2",
    date: "2025-10-01",
    type: "anime",
    posterPath: "",
  },
] as const;

// ---------------------------------------------------------------------------
// IMPORT_SOURCES — external import integrations
// ---------------------------------------------------------------------------

export const IMPORT_SOURCES: readonly ImportSource[] = [
  {
    name: "TMDB",
    icon: "movie",
    description: "Import ratings & watchlists from The Movie Database",
  },
  {
    name: "Trakt",
    icon: "tv",
    description: "Sync your Trakt.tv history and collections",
  },
  {
    name: "MyAnimeList",
    icon: "animation",
    description: "Import anime lists from MyAnimeList",
  },
  {
    name: "Letterboxd",
    icon: "local_movies",
    description: "Import diary and watchlist from Letterboxd",
  },
  {
    name: "IMDb",
    icon: "star",
    description: "Import ratings and watchlist from IMDb",
  },
] as const;

// ---------------------------------------------------------------------------
// DEMO_STAT_CARDS — for GlassStatCard rendering
// ---------------------------------------------------------------------------

export const DEMO_STAT_CARDS: readonly DemoStat[] = [
  { value: "247", label: "Titles Tracked", icon: "local_movies" },
  { value: "1,842", label: "Hours Watched", icon: "schedule" },
  { value: "7.9", label: "Avg Rating", icon: "star" },
  { value: "163", label: "Completed", icon: "check_circle" },
] as const;

// ---------------------------------------------------------------------------
// DEMO_GENRE_BARS — for CSS-only genre bar chart
// ---------------------------------------------------------------------------

export const DEMO_GENRE_BARS: readonly DemoGenreBar[] = [
  { genre: "Drama", percent: 28 },
  { genre: "Action", percent: 22 },
  { genre: "Sci-Fi", percent: 18 },
  { genre: "Thriller", percent: 14 },
  { genre: "Comedy", percent: 10 },
  { genre: "Fantasy", percent: 8 },
] as const;

// ---------------------------------------------------------------------------
// DEMO_TYPE_SPLIT — Movies vs Series percentage
// ---------------------------------------------------------------------------

export const DEMO_TYPE_SPLIT = {
  movies: 58,
  series: 42,
} as const;
