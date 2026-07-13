// src/features/profile/UpcomingPage.tsx
//
// UpcomingPage — "What's coming next?"
//
// A calendar-style discovery page showing movies and TV series that are
// going to be released. Uses TMDB's discover endpoints with date-range
// filters (30 days from a selectable start date).
//
// LAYOUT (v2.1, per user request):
//   • Header: back arrow, page title, subtitle
//   • Filter bar:
//       - Date picker (default = today; shows next 30 days from the
//         selected date — quick +7/+14/+30 buttons REMOVED)
//       - Type filter chips: All · Movies · Series
//       - Nationality dropdown (National / International)
//         National = titles from the user's country (profile.country)
//         International = titles from any OTHER country
//       - Language dropdown — depends on Nationality:
//         · National → languages spoken in the user's country
//         · International → curated set of world languages
//   • Two grouped sections (movies and series shown separately):
//       - Upcoming Movies — list grouped by release date
//       - Upcoming Series — list grouped by first air date
//   • Each card shows:
//       - Poster
//       - Title
//       - Release date (formatted)
//       - For movies: "In Theatres" or "On OTT" indicator
//       - For series: OTT/network name (Netflix, Prime, etc.)
//       - Trailer chip — opens a YouTube modal directly (no need to
//         open the full Details page just to watch the trailer)
//   • Click a title's body → opens Details modal
//
// COUNTRY FILTERING (per user request v2.1):
//   When Nationality = National, the TMDB discover query is constrained
//   to the user's profile.country via with_origin_country. Titles not
//   available in the user's country are excluded from Upcoming but
//   remain searchable in Discover (where the user can manually search
//   for any title worldwide).
//
// Architecture:
//   Route (/profile/upcoming) → UpcomingPage → TMDB discover + watch providers
//                                                   → openTitle (modal)
//                                                   → trailer modal

import {
  Show, For, createSignal, createMemo, createEffect, onCleanup, type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage, TMDB_KEY, pickTrailer } from "~/core/tmdb/tmdb";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import { openTitle } from "~/shared/hooks/useModalState";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import {
  INTERNATIONAL_LANGUAGES,
  languagesForCountry,
  countryLabel,
} from "~/shared/data/countryLanguages";
import PageContainer from "~/shared/ui/PageContainer";
import type { TMDBTitle, TMDBDetails, WatchlistItem } from "~/shared/types";

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
  /** Original language code (e.g. "hi", "en") — used for client-side language filter fallback */
  originalLanguage: string | null;
  /** Origin country codes (e.g. ["IN", "US"]) — used for Nationality filtering fallback */
  originCountry: string[];
}

interface UpcomingGroup {
  date: string;          // YYYY-MM-DD
  label: string;         // "Today" / "Tomorrow" / "Fri, Jul 18"
  movies: UpcomingItem[];
  series: UpcomingItem[];
}

type NationalityFilter = "national" | "international";

// ── Constants ────────────────────────────────────────────────────────

const API = "https://api.themoviedb.org/3";
const WINDOW_DAYS = 30;

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
  original_language?: string;
  origin_country?: string[];
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

interface TMDBVideosResponse {
  results?: Array<{ id: string; key: string; name: string; site: string; type: string; official?: boolean }>;
}

/**
 * Fetch upcoming movies in a date range.
 * Nationality filter:
 *   - "national" → constrain to the user's country via with_origin_country
 *   - "international" → exclude the user's country via without_origin_country
 * Language filter (optional): applied via with_original_language.
 *
 * v2.1 fix: Previously only fetched page 1 (max 20 results) and
 * required vote_count >= 0 (which actually excluded many upcoming
 * titles that have 0 votes because they haven't been released yet).
 * Now fetches up to 5 pages (100 results) and removes the
 * vote_count filter so ALL titles in the date range are returned.
 */
async function fetchUpcomingMovies(
  startDate: string,
  endDate: string,
  region: string,
  nationality: NationalityFilter,
  language: string | null,
): Promise<TMDBTitle[]> {
  const baseParams = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: "primary_release_date.asc",
    "primary_release_date.gte": startDate,
    "primary_release_date.lte": endDate,
    include_adult: "false",
  });
  if (nationality === "national") {
    baseParams.set("with_origin_country", region);
  } else {
    baseParams.set("without_origin_country", region);
  }
  if (language) baseParams.set("with_original_language", language);

  const cacheKey = buildCacheKey("tmdb:upcoming_movies_v22", { start: startDate, end: endDate, region, nationality, lang: language ?? "" });

  const res = await cachedFetch<{ results: TMDBRawMovie[]; total_pages: number }>(
    cacheKey,
    TMDB_TTL,
    async () => {
      // Fetch up to 5 pages (100 results) to cover a full 30-day
      // window. TMDB returns 20 results per page.
      const allResults: TMDBRawMovie[] = [];
      const maxPages = 5;
      for (let page = 1; page <= maxPages; page++) {
        const pageParams = new URLSearchParams(baseParams);
        pageParams.set("page", String(page));
        const r = await fetch(`${API}/discover/movie?${pageParams}`);
        if (!r.ok) {
          if (page === 1) throw new Error(`upcoming movies failed: ${r.status}`);
          break; // stop paginating on error after page 1
        }
        const data = await r.json();
        const results = data.results || [];
        allResults.push(...results);
        if (results.length < 20 || page >= (data.total_pages ?? 1)) break;
      }
      return { results: allResults, total_pages: Math.min(maxPages, 5) };
    },
  );
  return (res.results || []).map((t: TMDBRawMovie) => ({ ...t, media_type: "movie" as const }));
}

/**
 * Fetch upcoming TV series in a date range.
 * Same Nationality + Language logic as fetchUpcomingMovies.
 * Same v2.1 fix: fetch up to 5 pages, no vote_count filter.
 */
async function fetchUpcomingTv(
  startDate: string,
  endDate: string,
  region: string,
  nationality: NationalityFilter,
  language: string | null,
): Promise<TMDBTitle[]> {
  const baseParams = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: "first_air_date.asc",
    "first_air_date.gte": startDate,
    "first_air_date.lte": endDate,
    include_adult: "false",
  });
  if (nationality === "national") {
    baseParams.set("with_origin_country", region);
  } else {
    baseParams.set("without_origin_country", region);
  }
  if (language) baseParams.set("with_original_language", language);

  const cacheKey = buildCacheKey("tmdb:upcoming_tv_v22", { start: startDate, end: endDate, region, nationality, lang: language ?? "" });

  const res = await cachedFetch<{ results: TMDBRawTv[]; total_pages: number }>(
    cacheKey,
    TMDB_TTL,
    async () => {
      const allResults: TMDBRawTv[] = [];
      const maxPages = 5;
      for (let page = 1; page <= maxPages; page++) {
        const pageParams = new URLSearchParams(baseParams);
        pageParams.set("page", String(page));
        const r = await fetch(`${API}/discover/tv?${pageParams}`);
        if (!r.ok) {
          if (page === 1) throw new Error(`upcoming tv failed: ${r.status}`);
          break;
        }
        const data = await r.json();
        const results = data.results || [];
        allResults.push(...results);
        if (results.length < 20 || page >= (data.total_pages ?? 1)) break;
      }
      return { results: allResults, total_pages: Math.min(maxPages, 5) };
    },
  );
  return (res.results || []).map((t: TMDBRawTv) => ({ ...t, media_type: "tv" as const }));
}

/**
 * Fetch watch providers for a title. Returns the first flatrate (OTT)
 * provider name for the user's region, or null if none / on error.
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

/**
 * Fetch a trailer key for a single title. Used by the card's trailer
 * chip so the user can play the trailer without opening the Details
 * modal. Returns null if no YouTube trailer is available.
 */
async function fetchTrailerKey(
  mediaType: "movie" | "tv",
  id: number,
): Promise<string | null> {
  try {
    const res = await cachedFetch<TMDBVideosResponse>(
      buildCacheKey(`tmdb:videos:${mediaType}:${id}`, {}),
      TMDB_TTL,
      async () => {
        const r = await fetch(`${API}/${mediaType}/${id}/videos?api_key=${TMDB_KEY}&language=en-US`);
        if (!r.ok) throw new Error(`videos failed: ${r.status}`);
        return r.json();
      },
    );
    const details = { videos: res } as unknown as TMDBDetails;
    return pickTrailer(details)?.key ?? null;
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────

const UpcomingPage: Component = () => {
  const library = useUserLibrary();
  const region = useDiscoverRegion();

  // Filters
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [startDate, setStartDate] = createSignal<string>(ymd(today));
  const [typeFilter, setTypeFilter] = createSignal<"all" | "movies" | "series">("all");
  const [nationality, setNationality] = createSignal<NationalityFilter>("national");
  const [language, setLanguage] = createSignal<string>("");
  // v2.1: Filter dialog (Nationality + Language combined in one dialog,
  // opened by the filter icon button)
  const [showFilterDialog, setShowFilterDialog] = createSignal(false);

  // Data
  const [movies, setMovies] = createSignal<TMDBTitle[]>([]);
  const [series, setSeries] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // OTT info cache (per item id)
  const [movieOtt, setMovieOtt] = createSignal<Record<number, { providerName: string | null; isTheatrical: boolean }>>({});
  const [seriesOtt, setSeriesOtt] = createSignal<Record<number, string | null>>({});

  // Trailer modal state
  const [trailerKey, setTrailerKey] = createSignal<string | null>(null);
  const [trailerLoading, setTrailerLoading] = createSignal(false);

  const endDate = createMemo(() => {
    const d = parseDate(startDate());
    if (!d) return ymd(today);
    const end = new Date(d);
    end.setDate(end.getDate() + WINDOW_DAYS);
    return ymd(end);
  });

  // Language options depend on the nationality selection.
  // - National → languages of the user's country
  // - International → curated world languages
  const languageOptions = createMemo(() => {
    if (nationality() === "national") {
      return languagesForCountry(region());
    }
    return INTERNATIONAL_LANGUAGES;
  });

  // When the user toggles Nationality, reset the language selection so
  // it always matches a valid option in the new dropdown.
  createEffect(() => {
    // touch nationality
    nationality();
    // reset language to "all"
    setLanguage("");
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
      const r = region();
      const nat = nationality();
      const lang = language() || null;

      const promises: Promise<TMDBTitle[]>[] = [];
      if (typeFilter() !== "series") {
        promises.push(fetchUpcomingMovies(start, end, r, nat, lang));
      }
      if (typeFilter() !== "movies") {
        promises.push(fetchUpcomingTv(start, end, r, nat, lang));
      }

      const results = await Promise.all(promises);
      let mi = 0;
      if (typeFilter() !== "series") {
        setMovies(results[mi] ?? []);
        mi++;
      } else {
        setMovies([]);
      }
      if (typeFilter() !== "movies") {
        setSeries(results[mi] ?? []);
      } else {
        setSeries([]);
      }

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
        const info = await fetchWatchProvider("movie", m.id, region());
        return [m.id, info] as const;
      }),
    );
    const movieMap: Record<number, { providerName: string | null; isTheatrical: boolean }> = {};
    movieResults.forEach(([id, info]) => { movieMap[id as number] = info; });
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
    seriesResults.forEach(([id, name]) => { seriesMap[id as number] = name; });
    setSeriesOtt(seriesMap);
  };

  // Build the upcoming items (with formatted dates + OTT info)
  const upcomingMovies = createMemo<UpcomingItem[]>(() => {
    return movies().map((m) => {
      const dateStr = m.release_date ?? "";
      const ott = movieOtt()[m.id];
      const raw = m as unknown as TMDBRawMovie;
      return {
        ...m,
        formattedDate: formatDateShort(dateStr),
        rawDate: dateStr,
        ottInfo: ott?.providerName ?? null,
        isTheatrical: ott?.isTheatrical ?? true,
        originalLanguage: raw.original_language ?? null,
        originCountry: raw.origin_country ?? [],
      };
    });
  });

  const upcomingSeries = createMemo<UpcomingItem[]>(() => {
    return series().map((s) => {
      const dateStr = s.first_air_date ?? "";
      const raw = s as unknown as TMDBRawMovie;
      return {
        ...s,
        formattedDate: formatDateShort(dateStr),
        rawDate: dateStr,
        ottInfo: seriesOtt()[s.id] ?? null,
        isTheatrical: false,
        originalLanguage: raw.original_language ?? null,
        originCountry: raw.origin_country ?? [],
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

  // Trailer chip handler — fetches the trailer key and opens the modal.
  const handlePlayTrailer = async (e: MouseEvent, item: UpcomingItem) => {
    e.stopPropagation();
    e.preventDefault();
    setTrailerLoading(true);
    setTrailerKey(null);
    try {
      const key = await fetchTrailerKey(item.media_type, item.id);
      if (key) {
        setTrailerKey(key);
      } else {
        // No trailer available — fall back to opening Details so the
        // user can still see full info.
        handleClick(item);
      }
    } catch {
      handleClick(item);
    } finally {
      setTrailerLoading(false);
    }
  };

  const closeTrailer = () => setTrailerKey(null);

  // ESC to close trailer modal
  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", escCloseTrailer);
    }
  });
  const escCloseTrailer = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeTrailer();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", escCloseTrailer);
  }

  const onDateInput = (e: InputEvent) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    if (val) setStartDate(val);
  };

  // Display label for the current region (used in the Nationality hint).
  const regionLabel = createMemo(() => countryLabel(region()));

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
            Movies and series releasing in the next 30 days from your
            selected date. Tap any title for full details.
          </p>
        </div>

        <div class="sec-body">
          {/* Filter bar — v2.1 restructured:
              Line 1: Date selector only
              Line 2: All · Movies · Series · Filter icon
              Filter icon opens a dialog with Nationality + Language */}
          <div class="upcoming-filters upcoming-filters-v21">
            {/* Line 1: Date picker */}
            <div class="upcoming-date-row upcoming-date-row-v21">
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
            </div>

            {/* Line 2: Type chips + Filter icon */}
            <div class="upcoming-type-row upcoming-type-row-v21" role="group" aria-label="Filter by type and filters">
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

              {/* Filter icon — opens the Nationality + Language dialog */}
              <button
                type="button"
                class={`upcoming-filter-icon-btn focus-ring${(nationality() !== "national" || language() !== "") ? " upcoming-filter-icon-active" : ""}`}
                onClick={() => setShowFilterDialog(true)}
                aria-label="Open nationality and language filters"
                aria-haspopup="dialog"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                  tune
                </span>
                {/* Small dot indicator when filters are active */}
                <Show when={nationality() !== "national" || language() !== ""}>
                  <span class="upcoming-filter-icon-dot" aria-hidden="true" />
                </Show>
              </button>
            </div>
          </div>

          {/* Window label */}
          <p class="upcoming-window-label">
            Showing {formatDateShort(startDate())} → {formatDateShort(endDate())}
            {" · "}
            {nationality() === "national" ? `National (${regionLabel()})` : "International"}
            {language() ? ` · ${languageOptions().find((l) => l.code === language())?.label ?? language()}` : ""}
          </p>

          {/* Loading state */}
          <Show when={loading()}>
            <div class="upcoming-skeleton-grid">
              <For each={Array.from({ length: 4 })}>
                {() => <div class="upcoming-skeleton-card skeleton-base" />}
              </For>
            </div>
          </Show>

          {/* Trailer loading overlay */}
          <Show when={trailerLoading()}>
            <div class="upcoming-trailer-modal" role="status" aria-live="polite">
              <div class="upcoming-trailer-frame" style={{ display: "flex", "align-items": "center", "justify-content": "center" }}>
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "40px", color: "var(--p)", animation: "spin 1s linear infinite" }}
                  aria-hidden="true"
                >
                  progress_activity
                </span>
              </div>
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
              <p class="empty-premium-body">
                Try a different date, nationality, or language filter.
                Some titles may not be available in your country yet.
              </p>
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
                              <UpcomingCard
                                item={item}
                                onClick={() => handleClick(item)}
                                onPlayTrailer={(e) => handlePlayTrailer(e, item)}
                                type="movie"
                              />
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
                              <UpcomingCard
                                item={item}
                                onClick={() => handleClick(item)}
                                onPlayTrailer={(e) => handlePlayTrailer(e, item)}
                                type="series"
                              />
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

      {/* Trailer modal — YouTube iframe in a centered overlay.
          Rendered via Portal so it sits above the AppShell + BottomNav. */}
      <Show when={trailerKey()}>
        <Portal>
          <div
            class="upcoming-trailer-modal"
            onClick={closeTrailer}
            role="dialog"
            aria-modal="true"
            aria-label="Trailer player"
          >
            <div
              class="upcoming-trailer-frame"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                class="upcoming-trailer-close focus-ring"
                onClick={closeTrailer}
                aria-label="Close trailer"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                  close
                </span>
              </button>
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey()}?autoplay=1&rel=0&modestbranding=1`}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              />
            </div>
          </div>
        </Portal>
      </Show>

      {/* v2.1: Filter dialog — Nationality + Language combined.
          Opened by the filter icon button in the filter bar. */}
      <Show when={showFilterDialog()}>
        <Portal>
          <div
            class="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
            style={{
              background: "rgba(0,0,0,0.75)",
              "backdrop-filter": "blur(12px)",
              "-webkit-backdrop-filter": "blur(12px)",
              "padding-bottom": "var(--nav-total-height)",
            }}
            onClick={() => setShowFilterDialog(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Nationality and language filters"
          >
            <div
              class="w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter"
              style={{
                background: "var(--glass-bg-strong)",
                "backdrop-filter": "blur(28px)",
                "-webkit-backdrop-filter": "blur(28px)",
                border: "1px solid var(--hairline-2)",
                "box-shadow": "var(--shadow-elevated)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div
                class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden"
                style={{ background: "var(--hairline-2)" }}
                aria-hidden="true"
              />

              {/* Header */}
              <div
                class="flex justify-between items-center px-6 pt-4 pb-4"
                style={{ "border-bottom": "1px solid var(--hairline)" }}
              >
                <div class="flex items-center gap-2">
                  <span
                    class="material-symbols-outlined"
                    style={{ color: "var(--p)", "font-size": "18px" }}
                    aria-hidden="true"
                  >
                    tune
                  </span>
                  <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: 0 }}>
                    Filters
                  </h3>
                </div>
                <button
                  onClick={() => setShowFilterDialog(false)}
                  class="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--text-soft)",
                    border: "1px solid var(--hairline)",
                  }}
                  aria-label="Close filters"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "16px" }}
                    aria-hidden="true"
                  >
                    close
                  </span>
                </button>
              </div>

              {/* Filter options */}
              <div class="px-6 py-5 space-y-5">
                {/* Nationality */}
                <div>
                  <label class="upcoming-filter-dialog-label">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "14px" }}
                      aria-hidden="true"
                    >
                      flag
                    </span>
                    Nationality
                  </label>
                  <div class="upcoming-filter-dialog-options">
                    <button
                      type="button"
                      class={`upcoming-filter-dialog-option focus-ring${nationality() === "national" ? " active" : ""}`}
                      onClick={() => setNationality("national")}
                      aria-pressed={nationality() === "national"}
                    >
                      National ({regionLabel()})
                    </button>
                    <button
                      type="button"
                      class={`upcoming-filter-dialog-option focus-ring${nationality() === "international" ? " active" : ""}`}
                      onClick={() => setNationality("international")}
                      aria-pressed={nationality() === "international"}
                    >
                      International
                    </button>
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label class="upcoming-filter-dialog-label">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "14px" }}
                      aria-hidden="true"
                    >
                      translate
                    </span>
                    Language
                  </label>
                  <div class="upcoming-filter-dialog-options upcoming-filter-dialog-languages">
                    <button
                      type="button"
                      class={`upcoming-filter-dialog-option focus-ring${language() === "" ? " active" : ""}`}
                      onClick={() => setLanguage("")}
                      aria-pressed={language() === ""}
                    >
                      All Languages
                    </button>
                    <For each={languageOptions()}>
                      {(l) => (
                        <button
                          type="button"
                          class={`upcoming-filter-dialog-option focus-ring${language() === l.code ? " active" : ""}`}
                          onClick={() => setLanguage(l.code)}
                          aria-pressed={language() === l.code}
                        >
                          {l.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                class="px-6 pt-3 pb-5 flex gap-2"
                style={{ "border-top": "1px solid var(--hairline)" }}
              >
                <button
                  type="button"
                  class="upcoming-filter-dialog-reset focus-ring"
                  onClick={() => {
                    setNationality("national");
                    setLanguage("");
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  class="upcoming-filter-dialog-apply focus-ring"
                  onClick={() => setShowFilterDialog(false)}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </PageContainer>
  );
};

// ── UpcomingCard subcomponent ────────────────────────────────────────

interface UpcomingCardProps {
  item: UpcomingItem;
  onClick: () => void;
  onPlayTrailer: (e: MouseEvent) => void;
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
    <div
      class="upcoming-card focus-ring"
      onClick={() => props.onClick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      role="button"
      tabindex={0}
      aria-label={`${title()}, ${props.item.formattedDate}, ${ottLabel()}. Click to open details.`}
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

          {/* Trailer chip — opens the YouTube trailer modal directly.
              Stops propagation so the card click (which opens Details)
              doesn't fire. */}
          <button
            type="button"
            class="upcoming-card-trailer focus-ring"
            onClick={(e) => props.onPlayTrailer(e)}
            aria-label={`Watch trailer for ${title()}`}
          >
            <span class="material-symbols-outlined" style={{ "font-size": "10px" }} aria-hidden="true">
              play_arrow
            </span>
            Trailer
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpcomingPage;
