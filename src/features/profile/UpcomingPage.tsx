// src/features/profile/UpcomingPage.tsx
//
// UpcomingPage — "What's coming next?"
//
// A calendar-style discovery page showing movies and TV series that are
// going to be released. Uses TMDB's discover endpoints with date-range
// filters (next 30 days from a selectable start date).
//
// Layout (per user request — full design freedom, "best look"):
//   • Header: back arrow, page title, subtitle
//   • Filter bar:
//       - Date picker (default = today; shows next 30 days)
//       - Type filter chips: All · Movies · Series
//       - Genre filter (optional)
//   • Two grouped sections (movies and series shown separately):
//       - Upcoming Movies — list grouped by release date
//       - Upcoming Series — list grouped by first air date
//   • Each card shows:
//       - Poster
//       - Title
//       - Release date (formatted)
//       - For movies: "In Theatres" or "On OTT" indicator
//       - For series: OTT/network name (Netflix, Prime, etc.)
//   • Click a title → opens Details modal
//
// Data sources:
//   • Movies: /discover/movie with primary_release_date.gte/lte, sort by date asc
//   • Series: /discover/tv with first_air_date.gte/lte, sort by date asc
//   • OTT info: /tv/{id}/watch/providers for series networks,
//               /movie/{id}/watch/providers for movie OTT vs theatre
//
// Architecture:
//   Route (/profile/upcoming) → UpcomingPage → TMDB discover + watch providers
//                                                   → openTitle (modal)

import {
  Show, For, createSignal, createMemo, createEffect, type Component,
} from "solid-js";
import { tmdbImage, TMDB_KEY } from "~/core/tmdb/tmdb";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import { openTitle } from "~/shared/hooks/useModalState";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import PageContainer from "~/shared/ui/PageContainer";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

// ── Types ────────────────────────────────────────────────────────────

interface UpcomingItem extends TMDBTitle {
  /** Formatted release date for display (e.g. "Fri, Jul 18") */
  formattedDate: string;
  /** Raw date string YYYY-MM-DD */
  rawDate: string;
  /** Provider/network name (OTT) for series; "theatre" or provider name for movies */
  ottInfo: string | null;
  /** True if movie is releasing in theatres (no OTT flatrate available yet) */
  isTheatrical: boolean;
}

interface UpcomingGroup {
  date: string;          // YYYY-MM-DD
  label: string;         // "Today" / "Tomorrow" / "Fri, Jul 18"
  movies: UpcomingItem[];
  series: UpcomingItem[];
}

// ── Constants ────────────────────────────────────────────────────────

const API = "https://api.themoviedb.org/3";
const WINDOW_DAYS = 30;

// Curated genre list for the filter dropdown (movie genre IDs)
const GENRE_FILTERS: { label: string; movieId: number; tvId?: number }[] = [
  { label: "All Genres", movieId: 0 },
  { label: "Action", movieId: 28, tvId: 10759 },
  { label: "Adventure", movieId: 12, tvId: 10759 },
  { label: "Animation", movieId: 16, tvId: 16 },
  { label: "Comedy", movieId: 35, tvId: 35 },
  { label: "Crime", movieId: 80, tvId: 80 },
  { label: "Drama", movieId: 18, tvId: 18 },
  { label: "Fantasy", movieId: 14, tvId: 10765 },
  { label: "Horror", movieId: 27 },
  { label: "Mystery", movieId: 9648, tvId: 9648 },
  { label: "Romance", movieId: 10749 },
  { label: "Sci-Fi", movieId: 878, tvId: 10765 },
  { label: "Thriller", movieId: 53 },
];

// ── Helpers ──────────────────────────────────────────────────────────

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date | null {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function formatDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateShort(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface TMDBRawMovie {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  genre_ids?: number[];
}

interface TMDBRawTv extends TMDBRawMovie {}

interface TMDBWatchProvidersResponse {
  results?: Record<string, {
    flatrate?: Array<{ provider_name: string }>;
    buy?: Array<{ provider_name: string }>;
    rent?: Array<{ provider_name: string }>;
  }>;
}

interface TMDBTvDetailsResponse {
  networks?: Array<{ name: string }>;
}

interface TMDBDiscoverResponse {
  results?: TMDBRawMovie[];
}

/**
 * Fetch upcoming movies in a date range.
 * Sorts by release date ascending (soonest first).
 */
async function fetchUpcomingMovies(
  startDate: string,
  endDate: string,
  genreId: number,
): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: "primary_release_date.asc",
    "primary_release_date.gte": startDate,
    "primary_release_date.lte": endDate,
    "vote_count.gte": "0", // upcoming titles often have 0 votes
    page: "1",
    include_adult: "false",
  });
  if (genreId > 0) params.set("with_genres", String(genreId));

  const res = await cachedFetch<TMDBDiscoverResponse>(
    buildCacheKey("tmdb:upcoming_movies_range", { start: startDate, end: endDate, genre: genreId }),
    TMDB_TTL,
    async () => {
      const r = await fetch(`${API}/discover/movie?${params}`);
      if (!r.ok) throw new Error(`upcoming movies failed: ${r.status}`);
      return r.json();
    },
  );
  return (res.results || []).map((t: TMDBRawMovie) => ({ ...t, media_type: "movie" as const }));
}

/**
 * Fetch upcoming TV series in a date range.
 * Sorts by first air date ascending.
 */
async function fetchUpcomingTv(
  startDate: string,
  endDate: string,
  genreId: number,
  tvGenreId?: number,
): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: "first_air_date.asc",
    "first_air_date.gte": startDate,
    "first_air_date.lte": endDate,
    "vote_count.gte": "0",
    page: "1",
    include_adult: "false",
  });
  if (tvGenreId && tvGenreId > 0) params.set("with_genres", String(tvGenreId));
  else if (genreId > 0 && tvGenreId === undefined) {
    // no TV equivalent — skip genre filter for TV
  }

  const res = await cachedFetch<TMDBDiscoverResponse>(
    buildCacheKey("tmdb:upcoming_tv_range", { start: startDate, end: endDate, genre: tvGenreId ?? genreId }),
    TMDB_TTL,
    async () => {
      const r = await fetch(`${API}/discover/tv?${params}`);
      if (!r.ok) throw new Error(`upcoming tv failed: ${r.status}`);
      return r.json();
    },
  );
  return (res.results || []).map((t: TMDBRawTv) => ({ ...t, media_type: "tv" as const }));
}

/**
 * Fetch watch providers for a title. Returns the first flatrate (OTT)
 * provider name, or null if none / on error.
 *
 * For movies: if there's no flatrate provider, it's theatrical-only.
 * For series: networks are usually the OTT name (returned separately).
 */
async function fetchWatchProvider(
  mediaType: "movie" | "tv",
  id: number,
  region = "IN",
): Promise<{ providerName: string | null; isTheatrical: boolean }> {
  try {
    const res = await cachedFetch<TMDBWatchProvidersResponse>(
      buildCacheKey(`tmdb:watch_providers:${mediaType}:${id}:${region}`, {}),
      TMDB_TTL,
      async () => {
        const r = await fetch(`${API}/${mediaType}/${id}/watch/providers?api_key=${TMDB_KEY}`);
        if (!r.ok) throw new Error(`watch providers failed: ${r.status}`);
        return r.json();
      },
    );
    const regionData = res.results?.[region] ?? res.results?.["US"];
    const flatrate = regionData?.flatrate?.[0]?.provider_name ?? null;
    return {
      providerName: flatrate,
      isTheatrical: mediaType === "movie" && !flatrate,
    };
  } catch {
    return { providerName: null, isTheatrical: mediaType === "movie" };
  }
}

/**
 * Fetch TV network info (the OTT/network name for a series).
 * Faster than watch providers for series — networks come with /tv/{id}.
 */
async function fetchTvNetwork(id: number): Promise<string | null> {
  try {
    const res = await cachedFetch<TMDBTvDetailsResponse>(
      buildCacheKey(`tmdb:tv_network:${id}`, {}),
      TMDB_TTL,
      async () => {
        const r = await fetch(`${API}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`);
        if (!r.ok) throw new Error(`tv network failed: ${r.status}`);
        return r.json();
      },
    );
    return res.networks?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────

const UpcomingPage: Component = () => {
  const library = useUserLibrary();

  // Filters
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [startDate, setStartDate] = createSignal<string>(ymd(today));
  const [typeFilter, setTypeFilter] = createSignal<"all" | "movies" | "series">("all");
  const [genreFilter, setGenreFilter] = createSignal<number>(0);

  // Data
  const [movies, setMovies] = createSignal<TMDBTitle[]>([]);
  const [series, setSeries] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // OTT info cache (per item id)
  const [movieOtt, setMovieOtt] = createSignal<Record<number, { providerName: string | null; isTheatrical: boolean }>>({});
  const [seriesOtt, setSeriesOtt] = createSignal<Record<number, string | null>>({});

  const endDate = createMemo(() => {
    const d = parseDate(startDate());
    if (!d) return ymd(today);
    const end = new Date(d);
    end.setDate(end.getDate() + WINDOW_DAYS);
    return ymd(end);
  });

  // Reload on filter change
  createEffect(() => {
    void load();
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const start = startDate();
      const end = endDate();
      const genre = genreFilter();
      const genreDef = GENRE_FILTERS.find((g) => g.movieId === genre);

      const promises: Promise<TMDBTitle[]>[] = [];
      if (typeFilter() !== "series") {
        promises.push(fetchUpcomingMovies(start, end, genre));
      }
      if (typeFilter() !== "movies") {
        promises.push(fetchUpcomingTv(start, end, genre, genreDef?.tvId));
      }

      const results = await Promise.all(promises);
      let mi = 0;
      let si = 0;
      if (typeFilter() !== "series") {
        setMovies(results[mi] ?? []);
        mi++;
      } else {
        setMovies([]);
      }
      if (typeFilter() !== "movies") {
        setSeries(results[mi] ?? []);
        si = mi;
      } else {
        setSeries([]);
      }
      void si;

      // Fetch OTT info in parallel — capped at first 20 items each
      // to avoid hammering TMDB. The rest lazy-load on scroll (TODO).
      void fetchOttInfo();
    } catch (err) {
      console.error("[UpcomingPage] load failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchOttInfo = async () => {
    // Movies — fetch watch providers (theatrical vs OTT)
    const movieList = movies().slice(0, 20);
    const movieResults = await Promise.all(
      movieList.map(async (m) => {
        const info = await fetchWatchProvider("movie", m.id);
        return [m.id, info] as const;
      }),
    );
    const movieMap: Record<number, { providerName: string | null; isTheatrical: boolean }> = {};
    movieResults.forEach(([id, info]) => { movieMap[id] = info; });
    setMovieOtt(movieMap);

    // Series — fetch network name (faster than full watch providers)
    const seriesList = series().slice(0, 20);
    const seriesResults = await Promise.all(
      seriesList.map(async (s) => {
        const name = await fetchTvNetwork(s.id);
        return [s.id, name] as const;
      }),
    );
    const seriesMap: Record<number, string | null> = {};
    seriesResults.forEach(([id, name]) => { seriesMap[id] = name; });
    setSeriesOtt(seriesMap);
  };

  // Build the upcoming items (with formatted dates + OTT info)
  const upcomingMovies = createMemo<UpcomingItem[]>(() => {
    return movies().map((m) => {
      const dateStr = m.release_date ?? "";
      const ott = movieOtt()[m.id];
      return {
        ...m,
        formattedDate: formatDateShort(dateStr),
        rawDate: dateStr,
        ottInfo: ott?.providerName ?? null,
        isTheatrical: ott?.isTheatrical ?? true,
      };
    });
  });

  const upcomingSeries = createMemo<UpcomingItem[]>(() => {
    return series().map((s) => {
      const dateStr = s.first_air_date ?? "";
      return {
        ...s,
        formattedDate: formatDateShort(dateStr),
        rawDate: dateStr,
        ottInfo: seriesOtt()[s.id] ?? null,
        isTheatrical: false,
      };
    });
  });

  // Group by date — interleaves movies and series into a single timeline
  // of "release days". Each day shows its movies and series separately.
  const groups = createMemo<UpcomingGroup[]>(() => {
    const map = new Map<string, UpcomingGroup>();
    for (const m of upcomingMovies()) {
      if (!m.rawDate) continue;
      if (!map.has(m.rawDate)) {
        map.set(m.rawDate, { date: m.rawDate, label: formatDateLabel(m.rawDate), movies: [], series: [] });
      }
      map.get(m.rawDate)!.movies.push(m);
    }
    for (const s of upcomingSeries()) {
      if (!s.rawDate) continue;
      if (!map.has(s.rawDate)) {
        map.set(s.rawDate, { date: s.rawDate, label: formatDateLabel(s.rawDate), movies: [], series: [] });
      }
      map.get(s.rawDate)!.series.push(s);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  });

  const handleClick = (item: UpcomingItem) => {
    // Convert TMDBTitle → WatchlistItem shape for the modal
    const baseItem: WatchlistItem = {
      id: String(item.id),
      title: item.title,
      name: item.name,
      media_type: item.media_type,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      release_date: item.release_date,
      first_air_date: item.first_air_date,
      status: "Planned",
    } as WatchlistItem;
    openTitle(baseItem, library.watchlist());
  };

  // Date picker — quick jump buttons (Today, +7d, +14d, +30d)
  const quickDates = createMemo(() => {
    const base = parseDate(startDate()) ?? today;
    return [
      { label: "Today", offset: 0 },
      { label: "+7 days", offset: 7 },
      { label: "+14 days", offset: 14 },
      { label: "+30 days", offset: 30 },
    ].map((q) => {
      const d = new Date(base);
      d.setDate(d.getDate() + q.offset);
      return { label: q.label, date: ymd(d) };
    });
  });

  const onDateInput = (e: InputEvent) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    if (val) setStartDate(val);
  };

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in upcoming-page">
        {/* Header */}
        <div class="sec-header">
          <a href="/profile" class="sec-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Upcoming</p>
          <h1 class="sec-title">What's coming next</h1>
          <p class="sec-subtitle">
            Movies and series releasing in the next 30 days. Tap any title for full details.
          </p>
        </div>

        <div class="sec-body">
          {/* Filter bar */}
          <div class="upcoming-filters">
            {/* Date picker + quick jumps */}
            <div class="upcoming-date-row">
              <label class="upcoming-date-label" for="upcoming-date-input">
                <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                  calendar_today
                </span>
                From
              </label>
              <input
                id="upcoming-date-input"
                type="date"
                class="upcoming-date-input focus-ring"
                value={startDate()}
                onInput={onDateInput}
                min={ymd(today)}
              />
              <div class="upcoming-quick-dates" role="group" aria-label="Quick date jumps">
                <For each={quickDates()}>
                  {(q) => (
                    <button
                      type="button"
                      class="upcoming-quick-date focus-ring"
                      classList={{ active: q.date === startDate() }}
                      onClick={() => setStartDate(q.date)}
                      aria-pressed={q.date === startDate()}
                    >
                      {q.label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Type filter chips */}
            <div class="upcoming-type-row" role="group" aria-label="Filter by type">
              <For each={[
                { id: "all", label: "All" },
                { id: "movies", label: "Movies" },
                { id: "series", label: "Series" },
              ]}>
                {(chip) => (
                  <button
                    type="button"
                    class="upcoming-type-chip focus-ring"
                    classList={{ active: typeFilter() === chip.id }}
                    onClick={() => setTypeFilter(chip.id as "all" | "movies" | "series")}
                    aria-pressed={typeFilter() === chip.id}
                  >
                    {chip.label}
                  </button>
                )}
              </For>

              {/* Genre dropdown */}
              <select
                class="upcoming-genre-select focus-ring"
                value={genreFilter()}
                onChange={(e) => setGenreFilter(parseInt(e.currentTarget.value, 10))}
                aria-label="Filter by genre"
              >
                <For each={GENRE_FILTERS}>
                  {(g) => <option value={g.movieId}>{g.label}</option>}
                </For>
              </select>
            </div>
          </div>

          {/* Window label */}
          <p class="upcoming-window-label">
            Showing {formatDateShort(startDate())} → {formatDateShort(endDate())}
          </p>

          {/* Loading state */}
          <Show when={loading()}>
            <div class="upcoming-skeleton-grid">
              <For each={Array.from({ length: 4 })}>
                {() => <div class="upcoming-skeleton-card skeleton-base" />}
              </For>
            </div>
          </Show>

          {/* Error state */}
          <Show when={!loading() && error()}>
            <div class="empty-premium" role="alert">
              <h3 class="empty-premium-title">Couldn't load upcoming titles</h3>
              <p class="empty-premium-body">{error()}</p>
              <button class="btn-primary focus-ring" onClick={() => void load()} style={{ "margin-top": "var(--sp-2)" }}>
                Retry
              </button>
            </div>
          </Show>

          {/* Empty state */}
          <Show when={!loading() && !error() && groups().length === 0}>
            <div class="empty-premium" role="status">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                  event_busy
                </span>
              </div>
              <h3 class="empty-premium-title">No upcoming titles in this window</h3>
              <p class="empty-premium-body">Try a different date range or genre filter.</p>
            </div>
          </Show>

          {/* Timeline — grouped by date */}
          <Show when={!loading() && !error() && groups().length > 0}>
            <div class="upcoming-timeline">
              <For each={groups()}>
                {(group) => (
                  <div class="upcoming-day-group">
                    <div class="upcoming-day-header">
                      <span class="upcoming-day-label">{group.label}</span>
                      <span class="upcoming-day-count">
                        {group.movies.length + group.series.length}{" "}
                        {group.movies.length + group.series.length === 1 ? "title" : "titles"}
                      </span>
                    </div>

                    {/* Movies sub-section (only if filtered to include movies) */}
                    <Show when={typeFilter() !== "series" && group.movies.length > 0}>
                      <div class="upcoming-sub-section">
                        <p class="upcoming-sub-label">
                          <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">movie</span>
                          Movies
                        </p>
                        <div class="upcoming-list">
                          <For each={group.movies}>
                            {(item) => (
                              <UpcomingCard item={item} onClick={() => handleClick(item)} type="movie" />
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Series sub-section (only if filtered to include series) */}
                    <Show when={typeFilter() !== "movies" && group.series.length > 0}>
                      <div class="upcoming-sub-section">
                        <p class="upcoming-sub-label">
                          <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">tv</span>
                          Series
                        </p>
                        <div class="upcoming-list">
                          <For each={group.series}>
                            {(item) => (
                              <UpcomingCard item={item} onClick={() => handleClick(item)} type="series" />
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </PageContainer>
  );
};

// ── UpcomingCard subcomponent ────────────────────────────────────────

interface UpcomingCardProps {
  item: UpcomingItem;
  onClick: () => void;
  type: "movie" | "series";
}

const UpcomingCard: Component<UpcomingCardProps> = (props) => {
  const title = () => props.item.title || props.item.name || "Untitled";
  const posterUrl = () => tmdbImage(props.item.poster_path, "w185");
  const year = () => (props.item.rawDate || "").split("-")[0] || "";

  const ottLabel = () => {
    if (props.type === "movie") {
      if (props.item.isTheatrical) return "In Theatres";
      return props.item.ottInfo ? `On ${props.item.ottInfo}` : "Theatrical";
    }
    return props.item.ottInfo ? `On ${props.item.ottInfo}` : "Streaming";
  };

  return (
    <button
      type="button"
      class="upcoming-card focus-ring"
      onClick={() => props.onClick()}
      aria-label={`${title()}, ${props.item.formattedDate}, ${ottLabel()}`}
    >
      <div class="upcoming-card-poster">
        <Show
          when={props.item.poster_path}
          fallback={
            <div class="upcoming-card-poster-fallback">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "24px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                {props.type === "movie" ? "movie" : "tv"}
              </span>
            </div>
          }
        >
          <img
            src={posterUrl()}
            class="upcoming-card-poster-img"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </Show>
      </div>

      <div class="upcoming-card-body">
        <p class="upcoming-card-title">{title()}</p>
        <div class="upcoming-card-meta">
          <span class="upcoming-card-date">{props.item.formattedDate}</span>
          <Show when={year()}>
            <span class="upcoming-card-sep" aria-hidden="true">·</span>
            <span>{year()}</span>
          </Show>
        </div>
        <div class="upcoming-card-tags">
          <span class={`upcoming-card-ott ${props.item.isTheatrical ? "ott-theatrical" : "ott-streaming"}`}>
            <span class="material-symbols-outlined" style={{ "font-size": "10px" }} aria-hidden="true">
              {props.item.isTheatrical ? "theaters" : "play_circle"}
            </span>
            {ottLabel()}
          </span>
          <Show when={props.item.vote_average && props.item.vote_average > 0}>
            <span class="upcoming-card-rating">
              <span class="material-symbols-outlined" style={{ "font-size": "10px" }} aria-hidden="true">star</span>
              {props.item.vote_average!.toFixed(1)}
            </span>
          </Show>
        </div>
      </div>
    </button>
  );
};

export default UpcomingPage;
