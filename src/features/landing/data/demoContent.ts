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
    posterPath: "/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg",
  },
  {
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    rating: 9.0,
    genres: ["Action", "Crime", "Drama"],
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  },
  {
    title: "Interstellar",
    year: 2014,
    type: "movie",
    rating: 8.7,
    genres: ["Sci-Fi", "Drama", "Adventure"],
    posterPath: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg",
  },
  {
    title: "Parasite",
    year: 2019,
    type: "movie",
    rating: 8.5,
    genres: ["Thriller", "Drama", "Comedy"],
    posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
  },
  {
    title: "Dune",
    year: 2021,
    type: "movie",
    rating: 8.0,
    genres: ["Sci-Fi", "Adventure", "Drama"],
    posterPath: "/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg",
  },
  {
    title: "The Shawshank Redemption",
    year: 1994,
    type: "movie",
    rating: 9.3,
    genres: ["Drama"],
    posterPath: "/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg",
  },
  {
    title: "Pulp Fiction",
    year: 1994,
    type: "movie",
    rating: 8.9,
    genres: ["Crime", "Drama"],
    posterPath: "/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg",
  },
  {
    title: "The Matrix",
    year: 1999,
    type: "movie",
    rating: 8.7,
    genres: ["Sci-Fi", "Action"],
    posterPath: "/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg",
  },
  {
    title: "Blade Runner 2049",
    year: 2017,
    type: "movie",
    rating: 8.0,
    genres: ["Sci-Fi", "Drama", "Mystery"],
    posterPath: "/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
  },
  {
    title: "Mad Max: Fury Road",
    year: 2015,
    type: "movie",
    rating: 8.1,
    genres: ["Action", "Adventure", "Sci-Fi"],
    posterPath: "/ulcAi4dKpAjHwYGS08vNyx9H6I9.jpg",
  },
  {
    title: "Spirited Away",
    year: 2001,
    type: "movie",
    rating: 8.6,
    genres: ["Animation", "Adventure", "Fantasy"],
    posterPath: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
  },
  {
    title: "Whiplash",
    year: 2014,
    type: "movie",
    rating: 8.5,
    genres: ["Drama", "Music"],
    posterPath: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
  },
  {
    title: "The Grand Budapest Hotel",
    year: 2014,
    type: "movie",
    rating: 8.1,
    genres: ["Comedy", "Drama", "Adventure"],
    posterPath: "/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
  },
  {
    title: "Arrival",
    year: 2016,
    type: "movie",
    rating: 7.9,
    genres: ["Sci-Fi", "Drama", "Mystery"],
    posterPath: "/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
  },
  {
    title: "Everything Everywhere All at Once",
    year: 2022,
    type: "movie",
    rating: 7.8,
    genres: ["Action", "Adventure", "Comedy"],
    posterPath: "/u68AjlvlutfEIcpmbYpKcdi09ut.jpg",
  },
  {
    title: "Oppenheimer",
    year: 2023,
    type: "movie",
    rating: 8.3,
    genres: ["Drama", "History", "Biography"],
    posterPath: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
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
    posterPath: "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg",
  },
  {
    title: "Game of Thrones",
    year: 2011,
    type: "tv",
    rating: 9.2,
    genres: ["Fantasy", "Drama", "Action"],
    posterPath: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
  },
  {
    title: "Stranger Things",
    year: 2016,
    type: "tv",
    rating: 8.7,
    genres: ["Sci-Fi", "Horror", "Drama"],
    posterPath: "/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg",
  },
  {
    title: "The Crown",
    year: 2016,
    type: "tv",
    rating: 8.3,
    genres: ["Drama", "History", "Biography"],
    posterPath: "/1M876KPjulVwppEpldhdc8V4o68.jpg",
  },
  {
    title: "Chernobyl",
    year: 2019,
    type: "tv",
    rating: 9.4,
    genres: ["Drama", "History"],
    posterPath: "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg",
  },
  {
    title: "The Last of Us",
    year: 2023,
    type: "tv",
    rating: 8.8,
    genres: ["Drama", "Action", "Horror"],
    posterPath: "/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg",
  },
  {
    title: "Severance",
    year: 2022,
    type: "tv",
    rating: 8.7,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "/lAC6gf6iemJ8Xp5dW2VbZeexj7J.jpg",
  },
  {
    title: "Shōgun",
    year: 2024,
    type: "tv",
    rating: 8.6,
    genres: ["Drama", "History", "War"],
    posterPath: "/chmS6SkuwzGitf2fjgaLIQwlFUY.jpg",
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
    posterPath: "/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg",
  },
  {
    title: "Demon Slayer",
    year: 2019,
    type: "anime",
    rating: 8.5,
    genres: ["Action", "Fantasy", "Adventure"],
    posterPath: "/xUfRZu2mi8jH6SzQEJGP6tjBuYj.jpg",
  },
  {
    title: "One Piece",
    year: 1999,
    type: "anime",
    rating: 8.7,
    genres: ["Action", "Adventure", "Comedy"],
    posterPath: "/dB4EDhre2dsC2kxYDavyKWqLQwi.jpg",
  },
  {
    title: "Fullmetal Alchemist: Brotherhood",
    year: 2009,
    type: "anime",
    rating: 9.1,
    genres: ["Action", "Adventure", "Fantasy"],
    posterPath: "/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg",
  },
  {
    title: "Steins;Gate",
    year: 2011,
    type: "anime",
    rating: 8.8,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "/96R4bV7dB8ramaWceNKsxvJgCUd.jpg",
  },
  {
    title: "Death Note",
    year: 2006,
    type: "anime",
    rating: 8.6,
    genres: ["Thriller", "Mystery", "Supernatural"],
    posterPath: "/tCZFfYTIwrR7n94J6G14Y4hAFU6.jpg",
  },
  {
    title: "Cowboy Bebop",
    year: 1998,
    type: "anime",
    rating: 8.8,
    genres: ["Action", "Sci-Fi", "Drama"],
    posterPath: "/xDiXDfZwC6XYC6fxHI1jl3A3Ill.jpg",
  },
  {
    title: "Jujutsu Kaisen",
    year: 2020,
    type: "anime",
    rating: 8.4,
    genres: ["Action", "Supernatural", "Fantasy"],
    posterPath: "/sOow1zTzjsYSvqoCjwJa5sAiiPa.jpg",
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
  posterPath: "/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg",
  backdropPath: "/eZ239CUp1d6OryZEBPnO2n87gMG.jpg",
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
    posterPath: "/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg",
    status: "watching",
    episodeProgress: { current: 6, total: 9 },
  },
  {
    title: "Jujutsu Kaisen",
    year: 2020,
    type: "anime",
    rating: 8.4,
    genres: ["Action", "Supernatural", "Fantasy"],
    posterPath: "/sOow1zTzjsYSvqoCjwJa5sAiiPa.jpg",
    status: "watching",
    episodeProgress: { current: 18, total: 24 },
  },
  {
    title: "Severance",
    year: 2022,
    type: "tv",
    rating: 8.7,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "/lAC6gf6iemJ8Xp5dW2VbZeexj7J.jpg",
    status: "watching",
    episodeProgress: { current: 3, total: 9 },
  },
  {
    title: "Breaking Bad",
    year: 2008,
    type: "tv",
    rating: 9.5,
    genres: ["Crime", "Drama", "Thriller"],
    posterPath: "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg",
    status: "completed",
  },
  {
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    rating: 9.0,
    genres: ["Action", "Crime", "Drama"],
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    status: "completed",
  },
  {
    title: "Parasite",
    year: 2019,
    type: "movie",
    rating: 8.5,
    genres: ["Thriller", "Drama", "Comedy"],
    posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    status: "completed",
  },
  {
    title: "Fullmetal Alchemist: Brotherhood",
    year: 2009,
    type: "anime",
    rating: 9.1,
    genres: ["Action", "Adventure", "Fantasy"],
    posterPath: "/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg",
    status: "completed",
  },
  {
    title: "Dune: Part Two",
    year: 2024,
    type: "movie",
    rating: 8.6,
    genres: ["Sci-Fi", "Adventure", "Drama"],
    posterPath: "/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg",
    status: "planned",
  },
  {
    title: "Shōgun",
    year: 2024,
    type: "tv",
    rating: 8.6,
    genres: ["Drama", "History", "War"],
    posterPath: "/chmS6SkuwzGitf2fjgaLIQwlFUY.jpg",
    status: "planned",
  },
  {
    title: "Steins;Gate",
    year: 2011,
    type: "anime",
    rating: 8.8,
    genres: ["Sci-Fi", "Thriller", "Drama"],
    posterPath: "/96R4bV7dB8ramaWceNKsxvJgCUd.jpg",
    status: "planned",
  },
  {
    title: "The Crown",
    year: 2016,
    type: "tv",
    rating: 8.3,
    genres: ["Drama", "History", "Biography"],
    posterPath: "/1M876KPjulVwppEpldhdc8V4o68.jpg",
    status: "dropped",
  },
  {
    title: "Death Note",
    year: 2006,
    type: "anime",
    rating: 8.6,
    genres: ["Thriller", "Mystery", "Supernatural"],
    posterPath: "/tCZFfYTIwrR7n94J6G14Y4hAFU6.jpg",
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
    posterPath: "/nf5qaSEvyYSNeFH0YhSs5EsBLX9.jpg",
  },
  {
    title: "Thunderbolts*",
    date: "2025-05-02",
    type: "movie",
    posterPath: "/hqcexYHbiTBfDIdDWxrxPtVndBX.jpg",
  },
  {
    title: "One Piece Season 2",
    date: "2025-06-15",
    type: "anime",
    posterPath: "/m9E2IVdXpcsoQCmY8eAjXWC4YV7.jpg",
  },
  {
    title: "The Witcher S4",
    date: "2025-09-01",
    type: "tv",
    posterPath: "/AoGsDM02UVt0npBA8OvpDcZbaMi.jpg",
  },
  {
    title: "Mission: Impossible – The Final Reckoning",
    date: "2025-05-23",
    type: "movie",
    posterPath: "/iKPsC9EFUafRP9SrUznI61getVP.jpg",
  },
  {
    title: "Chainsaw Man Season 2",
    date: "2025-10-01",
    type: "anime",
    posterPath: "/iFM1dyFi0rByvEomEkmm7NpQeeb.jpg",
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
