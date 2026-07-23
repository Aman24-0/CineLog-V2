// src/features/profile/UpcomingPage.tsx
//
// UpcomingPage — "What's coming next?"
//
// A calendar-style discovery page showing movies and TV series that are
// going to be released. Uses TMDB's discover endpoints with date-range
// filters (30 days from a selectable start date).
//
// LAYOUT (v2.4 — V1-style timeline + OTT-only TV):
//   • Header: back arrow, page title, subtitle
//   • Filter bar:
//       - Date picker (default = today; shows next 30 days)
//       - Type filter chips: All · Movies · Series
//       - Filter icon — opens a dialog with just the Language picker
//   • Timeline view (matches CineLog V1 design):
//       - Vertical timeline line on the left
//       - Each date shows as a stacked badge on the left
//         (month abbrev like "JUL" on top, day number like "17" below)
//       - Movie/series cards on the right of each date marker
//       - Movies AND series are mixed together on the same date row
//         (sorted by date — not separated into Movies / Series sub-sections)
//   • Each card shows:
//       - Poster
//       - Title
//       - For movies: "In Theatres" or "On <platform>" badge
//       - For series: "S3 E5" episode info + "On <platform>" badge
//         (when next_episode_to_air is available from TMDB)
//       - NO trailer chip on the card — trailers are only playable
//         from the Details modal (v2.4 fix: removed trailer button
//         from cards per user request).
//   • Click a title's body → opens Details modal
//
// COUNTRY FILTERING (v2.4):
//   Movies:
//     `with_release_country=<region>` + `region=<region>` +
//     `release_date.gte/lte` returns ONLY movies that have a release
//     entry in the user's country within the date window — capturing
//     both local productions AND international films that release there.
//     v2.4 ALSO adds a client-side filter: drop any movie whose
//     `release_date` field falls outside [start, end]. This catches
//     stale TMDB results where a movie's primary release date is
//     outside the window but its IN release is inside (e.g. Cocktail 2
//     had primary release Jun 19 but appeared under a Jul 15–Aug 14
//     window — the client-side filter now drops it).
//   TV:
//     TMDB's /discover/tv endpoint does NOT support `with_release_country`.
//     v2.4 uses two complementary endpoints to surface upcoming episodes:
//       1. /discover/tv with `air_date.gte/lte` — finds any series with
//          at least one episode airing in the date window (this catches
//          both brand-new premieres AND new episodes of running series
//          like House of the Dragon S3 E5, Rick and Morty S9 E9, etc.)
//       2. Sort by popularity descending so well-known shows surface
//          first; obscure ones drop off the page.
//       3. For each result, fetch /tv/{id} to get `next_episode_to_air`
//          (season_number, episode_number, air_date) so we can show
//          "S3 E5" on the card and group by the episode's air date.
//       4. v2.4: For each result, ALSO fetch /tv/{id}/watch/providers
//          to find the flatrate (OTT) provider in the user's region.
//          Series WITHOUT a flatrate OTT provider are DROPPED — this
//          filters out TV-channel-only shows (e.g. daily soaps airing
//          on StarPlus, Colors, etc. with no OTT presence) per user
//          request. Shows that air on TV AND OTT (e.g. Disney+ Hotstar
//          for StarPlus shows) keep showing, with the OTT name as the
//          label.
//     No origin-country filter is applied (so international shows like
//     House of the Dragon appear). The country filter is implicit via
//     the user's discover region — only the air-date window matters.
//     Users can refine by Language via the filter dialog.
//
// Architecture:
//   Route (/profile/upcoming) → UpcomingPage → TMDB discover + watch providers
//                                                   → openTitle (modal)

import {
  Show, For, createSignal, createMemo, createEffect, type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage, TMDB_KEY } from "~/core/tmdb/tmdb";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import { openTitle } from "~/shared/hooks/useModalState";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import {
  languagesForCountry,
  countryLabel,
} from "~/shared/data/countryLanguages";
import PageContainer from "~/shared/ui/PageContainer";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

// ── Types ────────────────────────────────────────────────────────────

interface UpcomingItem extends TMDBTitle {
  /** Formatted release date for display (e.g. "Fri, Jul 18") */
  formattedDate: string;
  /** Raw date string YYYY-MM-DD used for grouping */
  rawDate: string;
  /** Provider/network name (OTT) for series; "theatre" or provider name for movies */
  ottInfo: string | null;
  /** True if movie is releasing in theatres (no OTT flatrate available yet) */
  isTheatrical: boolean;
  /** Original language code (e.g. "hi", "en") — used for client-side language filter fallback */
  originalLanguage: string | null;
  /** Origin country codes (e.g. ["IN", "US"]) — informational */
  originCountry: string[];
  /** For TV series with upcoming episodes: season number of the next episode */
  nextEpisodeSeason?: number | null;
  /** For TV series with upcoming episodes: episode number of the next episode */
  nextEpisodeNumber?: number | null;
  /** "movie" | "tv" — used by the card to render the right badge layout */
  media_type: "movie" | "tv";
}

interface UpcomingGroup {
  date: string;          // YYYY-MM-DD
  label: string;         // "Today" / "Tomorrow" / "Fri, Jul 18"
  items: UpcomingItem[]; // movies AND series mixed together (V1-style)
}

// ── Constants ────────────────────────────────────────────────────────

const API = "https://api.themoviedb.org/3";
const WINDOW_DAYS = 30;

// Max TV series to fetch episode details for (each costs one /tv/{id}
// request). 25 keeps the page snappy while covering the most popular
// upcoming series in a 30-day window.
const MAX_TV_EPISODE_LOOKUPS = 25;

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

/** Episode info returned by /tv/{id} as next_episode_to_air */
interface TMDBEpisode {
  id: number;
  name?: string;
  overview?: string;
  episode_number: number;
  season_number: number;
  air_date?: string;
  still_path?: string | null;
  runtime?: number | null;
}

interface TMDBWatchProvidersResponse {
  results?: Record<string, {
    flatrate?: Array<{ provider_name: string }>;
    buy?: Array<{ provider_name: string }>;
    rent?: Array<{ provider_name: string }>;
  }>;
}

interface TMDBTvDetailsResponse {
  networks?: Array<{ name: string }>;
  next_episode_to_air?: TMDBEpisode | null;
  last_episode_to_air?: TMDBEpisode | null;
  status?: string;
}

/**
 * Fetch upcoming movies in a date range, FILTERED to only titles that
 * have a release entry in the user's country.
 *
 * v2.2 country-relevance fix:
 *   - Uses `with_release_country=<region>` so ONLY movies that actually
 *     release in the user's country are returned. This captures both
 *     local productions AND big international films (e.g. Hollywood
 *     releases in India) that the previous `with_origin_country` filter
 *     missed.
 *   - Uses `release_date.gte/lte` (with `region=<region>`) instead of
 *     `primary_release_date.gte/lte` so the date window applies to the
 *     release date IN the user's country, not the worldwide first
 *     release date.
 *   - Removed the Nationality toggle entirely — every movie returned is
 *     by definition "releasing in your country", which is the only
 *     relevant set for an Upcoming page.
 *
 * Language filter (optional): applied via `with_original_language`.
 *
 * Pagination: fetches up to 5 pages (100 results) to cover a full
 * 30-day window. TMDB returns 20 results per page.
 */
async function fetchUpcomingMovies(
  startDate: string,
  endDate: string,
  region: string,
  language: string | null,
): Promise<TMDBTitle[]> {
  const baseParams = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: "release_date.asc",
    "release_date.gte": startDate,
    "release_date.lte": endDate,
    region, // context for release_date.gte/lte — filters by release date in this country
    with_release_country: region, // ONLY movies that have a release entry in this country
    include_adult: "false",
  });
  if (language) baseParams.set("with_original_language", language);

  const cacheKey = buildCacheKey("tmdb:upcoming_movies_v23", { start: startDate, end: endDate, region, lang: language ?? "" });

  const res = await cachedFetch<{ results: TMDBRawMovie[]; total_pages: number }>(
    cacheKey,
    TMDB_TTL,
    async () => {
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
 * Fetch upcoming TV series — ANY series with at least one episode
 * airing in the date window. Captures both brand-new premieres AND
 * new episodes of running series (House of the Dragon S3 E5, etc.).
 *
 * v2.3 fix:
 *   v2.2 used `first_air_date.gte/lte` + `with_origin_country`, which
 *   ONLY returned series premiering for the first time in the user's
 *   country. This missed every ongoing series (the screenshot showed
 *   zero series in V2, while V1 showed House of the Dragon S3 E5,
 *   Rick and Morty S9 E9, etc.).
 *
 *   v2.3 switches to `air_date.gte/lte` — a TMDB /discover/tv filter
 *   that matches any series having at least one episode air in the
 *   window. No origin-country filter is applied (so international
 *   shows surface). Results are sorted by popularity desc so famous
 *   shows come first and obscure ones drop off.
 *
 *   The `region` arg is currently unused (kept for API symmetry with
 *   fetchUpcomingMovies and future watch-provider filtering).
 */
async function fetchUpcomingTv(
  startDate: string,
  endDate: string,
  _region: string,
  language: string | null,
): Promise<TMDBTitle[]> {
  const baseParams = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: "popularity.desc", // famous shows first
    "air_date.gte": startDate, // any series with an episode airing in this window
    "air_date.lte": endDate,
    include_adult: "false",
  });
  if (language) baseParams.set("with_original_language", language);

  const cacheKey = buildCacheKey("tmdb:upcoming_tv_v24", { start: startDate, end: endDate, lang: language ?? "" });

  const res = await cachedFetch<{ results: TMDBRawTv[]; total_pages: number }>(
    cacheKey,
    TMDB_TTL,
    async () => {
      const allResults: TMDBRawTv[] = [];
      const maxPages = 3; // popularity desc → first 60 results is plenty
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
      return { results: allResults, total_pages: Math.min(maxPages, 3) };
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
 * Fetch TV details: network name + next_episode_to_air info + OTT
 * flatrate provider (via /tv/{id}/watch/providers).
 *
 * The next_episode_to_air field lets us show "S3 E5" on the card and
 * group by the actual episode air date (not just the series first_air_date).
 *
 * v2.4: ALSO fetches watch providers to find the OTT flatrate provider
 * in the user's region. This replaces the network name as the displayed
 * OTT label (so "StarPlus" shows as "Disney+ Hotstar" if the show is
 * also on Hotstar). Series with NO flatrate OTT provider in the user's
 * region are dropped by the caller — this filters out TV-channel-only
 * shows per user request ("Don't show tv series that are airing in tv
 * channel, show results only for the series releasing in OTT app").
 *
 * Returns:
 *   - network:    First network name (informational; usually the studio
 *                 or TV channel that produces the show).
 *   - nextEpisode: next_episode_to_air from TMDB (for "S3 E5" badge).
 *   - ottProvider: Flatrate OTT provider name in user's region, or null
 *                  if the show has no OTT streaming availability there.
 *                  (null = drop the series from the upcoming list.)
 */
async function fetchTvDetails(
  id: number,
  region: string,
): Promise<{
  network: string | null;
  nextEpisode: TMDBEpisode | null;
  ottProvider: string | null;
}> {
  try {
    const res = await cachedFetch<TMDBTvDetailsResponse>(
      buildCacheKey(`tmdb:tv_details:${id}`, {}),
      TMDB_TTL,
      async () => {
        // Append watch/providers to the same request so we get network,
        // next_episode_to_air, AND OTT providers in a single API call.
        const r = await fetch(
          `${API}/tv/${id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=next_episode_to_air,watch/providers`,
        );
        if (!r.ok) throw new Error(`tv details failed: ${r.status}`);
        return r.json();
      },
    );

    // Extract the flatrate OTT provider for the user's region.
    // watch/providers results are keyed by region code (e.g. "IN", "US").
    // Fall back to "US" if the user's region has no provider data (rare).
    const providerResults = (res as unknown as { "watch/providers"?: TMDBWatchProvidersResponse })["watch/providers"];
    const regionProviders = providerResults?.results?.[region]
      ?? providerResults?.results?.["US"];
    const flatrate = regionProviders?.flatrate?.[0]?.provider_name ?? null;

    return {
      network: res.networks?.[0]?.name ?? null,
      nextEpisode: res.next_episode_to_air ?? null,
      ottProvider: flatrate,
    };
  } catch {
    return { network: null, nextEpisode: null, ottProvider: null };
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
  const [language, setLanguage] = createSignal<string>("");
  // v2.2: Filter dialog now only contains the Language picker
  // (Nationality filter was removed — see module-level docs).
  const [showFilterDialog, setShowFilterDialog] = createSignal(false);

  // Data
  const [movies, setMovies] = createSignal<TMDBTitle[]>([]);
  const [series, setSeries] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // OTT / episode info caches (per item id)
  const [movieOtt, setMovieOtt] = createSignal<Record<number, { providerName: string | null; isTheatrical: boolean }>>({});
  // v2.4: per-series network + next_episode_to_air + OTT provider info.
  // ottProvider is null when the series has NO flatrate OTT provider in
  // the user's region — those series are dropped from the list (filters
  // out TV-channel-only shows per user request).
  const [seriesDetails, setSeriesDetails] = createSignal<Record<number, { network: string | null; nextEpisode: TMDBEpisode | null; ottProvider: string | null }>>({});

  const endDate = createMemo(() => {
    const d = parseDate(startDate());
    if (!d) return ymd(today);
    const end = new Date(d);
    end.setDate(end.getDate() + WINDOW_DAYS);
    return ymd(end);
  });

  // Language options — always the languages spoken in the user's
  // country. (v2.2: Nationality toggle removed; the country filter is
  // implicit — movies are scoped via `with_release_country` and TV via
  // `with_origin_country`, so the language picker only needs to cover
  // in-country languages.)
  const languageOptions = createMemo(() => languagesForCountry(region()));

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
      const lang = language() || null;

      const promises: Promise<TMDBTitle[]>[] = [];
      if (typeFilter() !== "series") {
        promises.push(fetchUpcomingMovies(start, end, r, lang));
      }
      if (typeFilter() !== "movies") {
        promises.push(fetchUpcomingTv(start, end, r, lang));
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

    // Series — fetch network + next_episode_to_air + OTT provider (v2.4).
    // Capped at MAX_TV_EPISODE_LOOKUPS to keep the page snappy.
    // v2.4: We fetch more (40) so we still have enough series left
    // after dropping the TV-channel-only ones (those without an OTT
    // flatrate provider in the user's region).
    const r = region();
    const seriesList = series().slice(0, Math.max(MAX_TV_EPISODE_LOOKUPS, 40));
    const seriesResults = await Promise.all(
      seriesList.map(async (s) => {
        const details = await fetchTvDetails(s.id, r);
        return [s.id, details] as const;
      }),
    );
    const seriesMap: Record<number, { network: string | null; nextEpisode: TMDBEpisode | null; ottProvider: string | null }> = {};
    seriesResults.forEach(([id, details]) => { seriesMap[id as number] = details; });
    setSeriesDetails(seriesMap);
  };

  // Build the upcoming items (with formatted dates + OTT info)
  //
  // v2.4 movie fix: client-side date filter. TMDB's `release_date.gte/lte`
  // + `region` filter is supposed to scope by IN release date, but the
  // `release_date` field returned is the PRIMARY (worldwide first)
  // release date. So a movie like Cocktail 2 — primary release Jun 19,
  // IN release Aug 5 — passes the API filter (IN release is in window)
  // but DISPLAYS as Jun 19 (outside window). The client-side filter
  // below drops any movie whose `release_date` falls outside [start, end]
  // so the user only ever sees movies whose displayed date is in the
  // selected window. (Per user: "Cocktail 2 is showing which is released
  // on 19 June that Is old date, fix this show correctly from selected
  // date to next 30 days.")
  const upcomingMovies = createMemo<UpcomingItem[]>(() => {
    const start = startDate();
    const end = endDate();
    return movies()
      .filter((m) => {
        const d = m.release_date ?? "";
        if (!d) return false;
        // Drop movies whose release_date is outside [start, end].
        // This catches Cocktail 2-style stale results.
        return d >= start && d <= end;
      })
      .map((m) => {
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
          nextEpisodeSeason: null,
          nextEpisodeNumber: null,
        };
      });
  });

  // v2.4 series fix: drop series that have NO flatrate OTT provider in
  // the user's region. This filters out TV-channel-only shows (daily
  // soaps on StarPlus, Colors, etc. with no OTT presence) per user
  // request: "Don't show tv series that are airing in tv channel, show
  // results only for the series releasing in OTT app."
  //
  // We need to wait for `seriesDetails` to be populated before applying
  // the OTT filter — otherwise the list would briefly show all series
  // (including TV-channel-only ones) and then collapse once details
  // arrive. The `groups()` memo naturally re-runs when seriesDetails
  // changes, so the UI updates as soon as the OTT info is fetched.
  //
  // For series whose details haven't been fetched yet (beyond the cap),
  // we keep them in the list with `ottInfo = null` so the user at least
  // sees something — but the OTT filter below drops them since we can't
  // verify they have an OTT provider.
  const upcomingSeries = createMemo<UpcomingItem[]>(() => {
    const detailsMap = seriesDetails();
    return series()
      .filter((s) => {
        const details = detailsMap[s.id];
        // If we have details, require an OTT flatrate provider.
        // If we don't have details (beyond fetch cap), drop the series
        // — we can't verify it has OTT availability.
        if (details) return details.ottProvider !== null;
        return false;
      })
      .map((s) => {
        const details = detailsMap[s.id];
        const ep = details?.nextEpisode ?? null;
        // v2.3: if we have next_episode_to_air with an air_date, group by
        // that date (so the user sees the actual upcoming episode date,
        // not the series's first_air_date which may be years ago).
        // Fall back to first_air_date for premieres where TMDB doesn't
        // yet have episode-level data.
        const dateStr = ep?.air_date ?? s.first_air_date ?? "";
        const raw = s as unknown as TMDBRawMovie;
        return {
          ...s,
          formattedDate: formatDateShort(dateStr),
          rawDate: dateStr,
          // v2.4: prefer OTT provider name (e.g. "Disney+ Hotstar")
          // over the network name (e.g. "StarPlus") — the user wants
          // to see the streaming platform, not the TV channel.
          ottInfo: details?.ottProvider ?? details?.network ?? null,
          isTheatrical: false,
          originalLanguage: raw.original_language ?? null,
          originCountry: raw.origin_country ?? [],
          nextEpisodeSeason: ep?.season_number ?? null,
          nextEpisodeNumber: ep?.episode_number ?? null,
        };
      });
  });

  // v2.3: V1-style timeline grouping. Movies AND series are mixed into
  // the same date bucket and sorted by date. Each group is one row in
  // the timeline (date badge on left, cards on right).
  const groups = createMemo<UpcomingGroup[]>(() => {
    const map = new Map<string, UpcomingGroup>();
    const all = [...upcomingMovies(), ...upcomingSeries()];
    for (const item of all) {
      if (!item.rawDate) continue;
      if (!map.has(item.rawDate)) {
        map.set(item.rawDate, { date: item.rawDate, label: formatDateLabel(item.rawDate), items: [] });
      }
      map.get(item.rawDate)!.items.push(item);
    }
    // Within each day, sort items so series-with-episode-info come first
    // (since those are the most relevant "next episode" events), then by
    // popularity (vote_count as a proxy).
    for (const g of map.values()) {
      g.items.sort((a, b) => {
        const aHasEp = a.media_type === "tv" && a.nextEpisodeNumber != null ? 1 : 0;
        const bHasEp = b.media_type === "tv" && b.nextEpisodeNumber != null ? 1 : 0;
        if (aHasEp !== bHasEp) return bHasEp - aHasEp;
        return (b.vote_count ?? 0) - (a.vote_count ?? 0);
      });
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

  // v2.4: Trailer modal + handlePlayTrailer removed. Trailers are now
  // only playable from the Details modal (per user request: "Remove
  // trailer button from card on main page, only show trailer from
  // detail modal after opening of any titles"). The card click opens
  // Details, which has its own trailer button backed by pickTrailer().

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
          {/* Filter bar — v2.2 restructured:
              Line 1: Date selector only
              Line 2: All · Movies · Series · Filter icon
              Filter icon opens a dialog with Language picker only
              (Nationality removed — country filter is implicit) */}
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

              {/* Filter icon — opens the Language dialog */}
              <button
                type="button"
                class={`upcoming-filter-icon-btn focus-ring${language() !== "" ? " upcoming-filter-icon-active" : ""}`}
                onClick={() => setShowFilterDialog(true)}
                aria-label="Open language filter"
                aria-haspopup="dialog"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                  tune
                </span>
                {/* Small dot indicator when a language filter is active */}
                <Show when={language() !== ""}>
                  <span class="upcoming-filter-icon-dot" aria-hidden="true" />
                </Show>
              </button>
            </div>
          </div>

          {/* Window label */}
          <p class="upcoming-window-label">
            Showing {formatDateShort(startDate())} → {formatDateShort(endDate())}
            {" · "}
            Releasing in {regionLabel()}
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

          {/* Error state */}
          <Show when={!loading() && error()}>
            <div class="empty-premium" role="alert">
              <h3 class="empty-premium-title">Couldn't load upcoming titles</h3>
              <p class="empty-premium-body">We couldn't reach the movie database right now. Please check your connection and try again.</p>
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
                Try a different date or language filter. Movies are
                scoped to titles releasing in {regionLabel()} between
                the selected dates. Series are scoped to those with
                upcoming episodes airing on OTT platforms in your
                region (TV-channel-only shows are excluded).
              </p>
            </div>
          </Show>

          {/* Timeline — V1-style: vertical line on left, date badge on left,
              cards on right. Movies AND series are mixed together per date. */}
          <Show when={!loading() && !error() && groups().length > 0}>
            <div class="upcoming-timeline upcoming-timeline-v23">
              <For each={groups()}>
                {(group) => {
                  // Split month + day for the date badge (e.g. "Jul" + "17")
                  const d = parseDate(group.date);
                  const monthShort = d ? d.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
                  const dayNum = d ? String(d.getDate()) : "";
                  return (
                    <div class="upcoming-day-row-v23">
                      {/* Left: date badge anchored to the vertical timeline */}
                      <div class="upcoming-date-badge-v23">
                        <span class="upcoming-date-badge-month">{monthShort}</span>
                        <span class="upcoming-date-badge-day">{dayNum}</span>
                      </div>

                      {/* Right: cards for this date (movies + series mixed) */}
                      <div class="upcoming-day-cards-v23">
                        <div class="upcoming-day-cards-header">
                          <span class="upcoming-day-cards-label">{group.label}</span>
                          <span class="upcoming-day-cards-count">
                            {group.items.length} {group.items.length === 1 ? "title" : "titles"}
                          </span>
                        </div>
                        <div class="upcoming-list">
                          <For each={group.items}>
                            {(item) => (
                              <UpcomingCard
                                item={item}
                                onClick={() => handleClick(item)}
                                type={item.media_type === "tv" ? "series" : "movie"}
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* v2.2: Filter dialog — Language picker only.
          (Nationality filter was removed; country filter is implicit
          via `with_release_country` for movies and `with_origin_country`
          for TV — see module-level docs.) Opened by the filter icon. */}
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
            aria-label="Language filter"
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
                {/* Country info banner — explains why there's no Nationality toggle */}
                <div
                  class="flex items-start gap-2 p-3 rounded-xl"
                  style={{
                    background: "color-mix(in srgb, var(--p) 8%, var(--tier-2))",
                    border: "1px solid color-mix(in srgb, var(--p) 25%, var(--hairline))",
                  }}
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "16px", color: "var(--p)", "margin-top": "2px" }}
                    aria-hidden="true"
                  >
                    info
                  </span>
                  <p
                    style={{
                      "font-size": "0.75rem",
                      "line-height": "1.4",
                      color: "var(--text-soft)",
                      margin: 0,
                    }}
                  >
                    Showing only titles releasing in{" "}
                    <strong style={{ color: "var(--text-strong)" }}>{regionLabel()}</strong>.
                    Change your country from Account settings if needed.
                  </p>
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

  // v2.3: "S3 E5" episode badge for series with next_episode_to_air info
  const episodeLabel = () => {
    if (props.type !== "series") return null;
    const s = props.item.nextEpisodeSeason;
    const e = props.item.nextEpisodeNumber;
    if (s == null || e == null) return null;
    return `S${s} E${e}`;
  };

  // v2.3: "X days" countdown chip (matches V1 "4 DAYS" style)
  const daysUntil = () => {
    if (!props.item.rawDate) return null;
    const d = parseDate(props.item.rawDate);
    if (!d) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return null;          // already released
    if (diff === 0) return "Today";
    if (diff === 1) return "1 DAY";
    return `${diff} DAYS`;
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
      aria-label={`${title()}, ${props.item.formattedDate}, ${ottLabel()}${episodeLabel() ? `, ${episodeLabel()}` : ""}. Click to open details.`}
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
          {/* v2.3: V1-style "X DAYS" countdown chip (accent color) */}
          <Show when={daysUntil()}>
            <span class="upcoming-card-days">
              <span class="material-symbols-outlined" style={{ "font-size": "10px" }} aria-hidden="true">
                schedule
              </span>
              {daysUntil()}
            </span>
          </Show>

          {/* v2.3: V1-style "S3 E5" episode chip for series */}
          <Show when={episodeLabel()}>
            <span class="upcoming-card-episode">
              <span class="material-symbols-outlined" style={{ "font-size": "10px" }} aria-hidden="true">
                tv
              </span>
              {episodeLabel()}
            </span>
          </Show>

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

          {/* v2.4: Trailer chip removed from card. Trailers are now only
              playable from the Details modal (per user request: "Remove
              trailer button from card on main page, only show trailer
              from detail modal after opening of any titles"). Clicking
              the card body opens Details, which has its own trailer
              button backed by pickTrailer() over the full TMDB videos
              payload (including teasers, clips, and featurettes). */}
        </div>
      </div>
    </div>
  );
};

export default UpcomingPage;
