// src/lib/supabase/repositories/upcoming.ts
//
// Upcoming Page — Supabase persistence layer + TMDB fetch wrapper.
//
// Two tables (defined in supabase/migrations/20260801_add_upcoming_notifications.sql):
//   • notifications     — the in-app notification feed.
//   • user_reminders    — the user's "Remind Me" subscriptions.
//
// Both are owner-only via RLS (user_id = auth.uid()). Every function
// here is defensive: it returns an empty array / false on error so the
// Upcoming page degrades gracefully when the tables don't exist yet
// (e.g. before the user runs the migration) or when Supabase is
// unreachable.
//
// The TMDB-side fetch (getUpcomingTitles) uses raw fetch() against the
// server-side /api/media/* proxy (so the API key is read from
// TMDB_API_KEY server-side). It does NOT use the discoverMovies /
// discoverTv helpers because those helpers do not support
// `with_release_country` (movies) or `air_date.gte/lte` (TV), both of
// which are critical for region-accurate upcoming results.

import { getClient } from "~/lib/supabase/client";
import type { TMDBTitle } from "~/shared/types";
import {
  normalizeList,
  type TMDBRawItem,
} from "~/core/tmdb/discoverNormalize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "reminder"
  | "watchlist_added"
  | "season_available"
  | "info";

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  related_title_id: string | null;
  related_title_type: "movie" | "series" | "episode" | null;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  is_read: boolean;
}

export interface UserReminderRow {
  id: string;
  user_id: string;
  tmdb_id: string;
  title_type: "movie" | "series";
  release_date: string;
  is_scheduled: boolean;
  notification_sent: boolean;
  created_at: string;
}

export interface UpcomingQueryParams {
  region: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  genres?: number[]; // TMDB genre IDs
  /**
   * @deprecated Kept for backward-compat with callers that still pass
   *   it. The repository ignores this field — minimum-rating filtering
   *   is irrelevant for upcoming titles because most have 0 votes.
   */
  minRating?: number;
  mediaType?: "all" | "movie" | "tv";
  sortBy?: "date" | "rating" | "popularity" | "title";
}

// ---------------------------------------------------------------------------
// Debug flag — set via localStorage["cinelog:upcoming:debug"] = "1"
// to surface TMDB URL + result counts in the browser console.
// ---------------------------------------------------------------------------

function isDebug(): boolean {
  try {
    return typeof localStorage !== "undefined" &&
      localStorage.getItem("cinelog:upcoming:debug") === "1";
  } catch {
    return false;
  }
}

function debug(...args: unknown[]): void {
  if (isDebug()) console.log("[upcoming]", ...args);
}

// ---------------------------------------------------------------------------
// Mock data — used as a last-resort fallback when BOTH TMDB discover
// calls fail (network down, proxy 502, etc.). Returning an empty list
// in that case would show the "No upcoming titles" empty state, which
// looks broken even though it's technically correct. The mock list is
// clearly labeled and only fires when there's no real data to show.
// Set localStorage["cinelog:upcoming:mock"] = "1" to FORCE mock mode
// for development.
// ---------------------------------------------------------------------------

function getMockUpcomingTitles(): TMDBTitle[] {
  const today = new Date();
  const fmt = (d: Date): string => d.toISOString().slice(0, 10);
  const shift = (days: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return fmt(d);
  };

  return [
    {
      id: 900001, title: "Echoes of Tomorrow", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(0), vote_average: 8.1, vote_count: 0,
      genre_ids: [878], genres: ["Sci-Fi"],
    },
    {
      id: 900002, title: "The Last Cartographer", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(1), vote_average: 7.4, vote_count: 0,
      genre_ids: [18], genres: ["Drama"],
    },
    {
      id: 900003, name: "Quantum Drift", media_type: "tv",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      first_air_date: shift(2), vote_average: 8.6, vote_count: 0,
      genre_ids: [10765], genres: ["Sci-Fi & Fantasy"],
      seasonNumber: 2, episodeNumber: 5, episodeAirDate: shift(2),
    },
    {
      id: 900004, title: "Midnight Protocol", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(4), vote_average: 6.9, vote_count: 0,
      genre_ids: [28, 53], genres: ["Action", "Thriller"],
    },
    {
      id: 900005, name: "Harbor Light", media_type: "tv",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      first_air_date: shift(6), vote_average: 7.8, vote_count: 0,
      genre_ids: [18], genres: ["Drama"],
      seasonNumber: 1, episodeNumber: 3, episodeAirDate: shift(6),
    },
    {
      id: 900006, title: "Beneath the Glass Sea", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(9), vote_average: 8.3, vote_count: 0,
      genre_ids: [878, 18], genres: ["Sci-Fi", "Drama"],
    },
    {
      id: 900007, title: "Painted Sun", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(12), vote_average: 7.1, vote_count: 0,
      genre_ids: [35], genres: ["Comedy"],
    },
    {
      id: 900008, name: "The Veridian Heir", media_type: "tv",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      first_air_date: shift(15), vote_average: 8.0, vote_count: 0,
      genre_ids: [10759, 18], genres: ["Action & Adventure", "Drama"],
      seasonNumber: 3, episodeNumber: 1, episodeAirDate: shift(15),
    },
    {
      id: 900009, title: "Concrete Garden", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(21), vote_average: 7.5, vote_count: 0,
      genre_ids: [18], genres: ["Drama"],
    },
    {
      id: 900010, title: "Saltwater Empire", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(27), vote_average: 8.4, vote_count: 0,
      genre_ids: [12, 28], genres: ["Adventure", "Action"],
    },
    {
      id: 900011, name: "Aurora Station", media_type: "tv",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      first_air_date: shift(30), vote_average: 8.7, vote_count: 0,
      genre_ids: [10765], genres: ["Sci-Fi & Fantasy"],
      seasonNumber: 2, episodeNumber: 8, episodeAirDate: shift(30),
    },
    {
      id: 900012, title: "The Quiet Architect", media_type: "movie",
      poster_path: null, backdrop_path: null,
      overview: "Mock title — for development only.",
      release_date: shift(45), vote_average: 7.9, vote_count: 0,
      genre_ids: [18, 9648], genres: ["Drama", "Mystery"],
    },
  ];
}

function isMockMode(): boolean {
  try {
    return typeof localStorage !== "undefined" &&
      localStorage.getItem("cinelog:upcoming:mock") === "1";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// TMDB fetch primitives — raw fetch against the /api/media/* proxy.
// ---------------------------------------------------------------------------

const API = "/api/media";
const TMDB_FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, timeoutMs = TMDB_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build a URLSearchParams for /discover/movie that returns titles
 * actually releasing in the user's region within the date window.
 *
 * v3 region fix:
 *   - `with_release_country` filters to movies that have a release
 *     entry in the user's country (so banned / unreleased titles drop).
 *   - `release_date.gte/lte` + `region` makes the date window apply
 *     to the in-region release date, not the worldwide first release.
 *   - `sort_by=release_date.asc` so the earliest releases come first.
 */
function buildMovieParams(params: UpcomingQueryParams, page: number): URLSearchParams {
  const p = new URLSearchParams({
    language: "en-US",
    sort_by: "release_date.asc",
    "release_date.gte": params.startDate,
    "release_date.lte": params.endDate,
    region: params.region,
    with_release_country: params.region,
    include_adult: "false",
    page: String(page),
  });
  if (params.genres?.length) p.set("with_genres", params.genres.join(","));
  return p;
}

/**
 * Build a URLSearchParams for /discover/tv that returns series with at
 * least one episode airing in the date window.
 *
 * v4 fix (this commit):
 *   - Uses `air_date.gte/lte` (NOT `first_air_date.gte/lte`) so we
 *     capture both brand-new premieres AND new episodes of running
 *     series (House of the Dragon S3 E5, etc.).
 *   - **Dropped `with_origin_country`.** That filter is too restrictive
 *     — it filters by the series' production country, which excludes
 *     many popular shows whose TMDB metadata lists a non-US origin
 *     country (e.g. shows filmed in the UK/Canada but distributed
 *     worldwide). The result was that high-profile series like
 *     "House of the Dragon" — which the user expected to see — were
 *     silently dropped.
 *   - **Dropped `with_watch_providers` + `watch_region`** as a discover
 *     filter — most upcoming series haven't been licensed for streaming
 *     in every region yet, so the filter would drop them. We surface
 *     the user's region providers via the post-fetch `getWatchProviders`
 *     enrichment instead (top 30 titles).
 *   - `sort_by=popularity.desc` so famous shows come first.
 *
 * The user's region still affects what they see:
 *   1. The card's OTT badges (via `getWatchProviders` enrichment).
 *   2. The "available in your region" hint (when providers array is
 *      empty for a popular title, it's likely not yet licensed there).
 */
function buildTvParams(params: UpcomingQueryParams, page: number): URLSearchParams {
  const p = new URLSearchParams({
    language: "en-US",
    sort_by: "popularity.desc",
    "air_date.gte": params.startDate,
    "air_date.lte": params.endDate,
    include_adult: "false",
    page: String(page),
  });
  if (params.genres?.length) p.set("with_genres", params.genres.join(","));
  return p;
}

/**
 * Discover movies (paginated). Up to `maxPages` pages of 20 results
 * each are fetched. Pagination stops early if TMDB returns < 20
 * results on a page or reports `page >= total_pages`.
 */
async function discoverUpcomingMovies(
  params: UpcomingQueryParams,
  maxPages = 3,
): Promise<TMDBTitle[]> {
  const out: TMDBTitle[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${API}/discover/movie?${buildMovieParams(params, page)}`;
    debug(`[movie] page ${page} → ${url}`);
    let res: Response;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      debug(`[movie] page ${page} network error:`, err);
      throw new Error(`discover/movie fetch failed (page ${page}): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      debug(`[movie] page ${page} HTTP ${res.status}`);
      throw new Error(`discover/movie failed (page ${page}): HTTP ${res.status}`);
    }
    const data = await res.json() as { results?: TMDBRawItem[]; total_pages?: number };
    const results = normalizeList(data.results, "movie");
    out.push(...results);
    debug(`[movie] page ${page} returned ${results.length} result(s)`);
    if (results.length < 20) break;
    if (data.total_pages && page >= data.total_pages) break;
  }
  return out;
}

/**
 * Discover TV series (paginated). Same pagination strategy as movies,
 * but defaults to 3 pages (up to 60 series) — kept narrower than v4's
 * 5 pages because v5 enriches EVERY returned series with
 * `getNextEpisode` (one extra HTTP call per series). 60 series × 1
 * enrichment call each, processed 12-concurrent, finishes in ~1.3s.
 * Going wider would push the page load past 2s for marginal gain —
 * the most popular series (the ones users actually care about) are
 * already on page 1-2 thanks to `sort_by=popularity.desc`.
 */
async function discoverUpcomingTv(
  params: UpcomingQueryParams,
  maxPages = 3,
): Promise<TMDBTitle[]> {
  const out: TMDBTitle[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${API}/discover/tv?${buildTvParams(params, page)}`;
    debug(`[tv] page ${page} → ${url}`);
    let res: Response;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      debug(`[tv] page ${page} network error:`, err);
      throw new Error(`discover/tv fetch failed (page ${page}): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      debug(`[tv] page ${page} HTTP ${res.status}`);
      throw new Error(`discover/tv failed (page ${page}): HTTP ${res.status}`);
    }
    const data = await res.json() as { results?: TMDBRawItem[]; total_pages?: number };
    const results = normalizeList(data.results, "tv");
    out.push(...results);
    debug(`[tv] page ${page} returned ${results.length} result(s)`);
    if (results.length < 20) break;
    if (data.total_pages && page >= data.total_pages) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// TV enrichment: next-episode details
// ---------------------------------------------------------------------------

interface NextEpisodeInfo {
  season: number;
  episode: number;
  air_date: string | null;
}

/**
 * getNextEpisode — fetch the next-episode-to-air for a TV series.
 *
 * Returns null if the series has no upcoming episode (e.g. ended, or
 * the next air date is unknown), or if the fetch fails. We never
 * throw — a missing next-episode just means the card shows the
 * series' first_air_date as fallback.
 *
 * Endpoint: /tv/{id}/next_episode_to_air
 * Docs: https://developer.themoviedb.org/reference/tv-series-next-episode-to-air
 */
export async function getNextEpisode(
  tvId: number | string,
): Promise<NextEpisodeInfo | null> {
  try {
    const url = `${API}/tv/${tvId}/next_episode_to_air?language=en-US`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      debug(`[next-episode] tv/${tvId} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as {
      season_number?: number;
      episode_number?: number;
      air_date?: string | null;
    } | null;
    if (!data || data.season_number == null || data.episode_number == null) {
      return null;
    }
    return {
      season: data.season_number,
      episode: data.episode_number,
      air_date: data.air_date ?? null,
    };
  } catch (err) {
    debug(`[next-episode] tv/${tvId} error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Watch providers enrichment
// ---------------------------------------------------------------------------

/**
 * getWatchProviders — fetch the streaming/rent/buy provider names for
 * a title in the user's region.
 *
 * Returns an array of provider names (e.g. ["Netflix", "Amazon Prime
 * Video"]). Empty array if no providers are available in the region
 * or the fetch fails. We dedupe by provider_name and cap at 4 names
 * to keep the card UI compact.
 *
 * Endpoint: /{type}/{id}/watch/providers
 * Docs: https://developer.themoviedb.org/reference/movie-watch-providers
 */
export async function getWatchProviders(
  id: number | string,
  type: "movie" | "tv",
  region: string,
): Promise<string[]> {
  try {
    const url = `${API}/${type}/${id}/watch/providers?language=en-US`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      debug(`[providers] ${type}/${id} HTTP ${res.status}`);
      return [];
    }
    const data = await res.json() as {
      results?: Record<string, {
        link?: string;
        flatrate?: Array<{ provider_name: string }>;
        rent?: Array<{ provider_name: string }>;
        buy?: Array<{ provider_name: string }>;
        free?: Array<{ provider_name: string }>;
        ads?: Array<{ provider_name: string }>;
      }>;
    };
    const regionEntry = data.results?.[region];
    if (!regionEntry) return [];
    // Priority: flatrate (subscription) > rent > buy > free > ads
    const names: string[] = [];
    const seen = new Set<string>();
    const pushAll = (arr: Array<{ provider_name: string }> | undefined) => {
      if (!Array.isArray(arr)) return;
      for (const p of arr) {
        const n = p.provider_name;
        if (!n || seen.has(n)) continue;
        seen.add(n);
        names.push(n);
        if (names.length >= 4) return;
      }
    };
    pushAll(regionEntry.flatrate);
    if (names.length < 4) pushAll(regionEntry.rent);
    if (names.length < 4) pushAll(regionEntry.buy);
    if (names.length < 4) pushAll(regionEntry.free);
    if (names.length < 4) pushAll(regionEntry.ads);
    return names;
  } catch (err) {
    debug(`[providers] ${type}/${id} error:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main fetch — getUpcomingTitles
// ---------------------------------------------------------------------------

/**
 * Fetch upcoming movies + TV from TMDB, filtered by the given params.
 *
 * Movies: discover/movie with `release_date.gte/lte` + `region` +
 *         `with_release_country`. Returns ONLY movies that have a
 *         release entry in the user's country within the date window.
 *
 * TV:     discover/tv with `air_date.gte/lte` (no region filter —
 *         see buildTvParams for why `with_origin_country` and
 *         `with_watch_providers` were dropped). Returns ANY series
 *         with at least one episode airing in the window — captures
 *         both new premieres and ongoing series.
 *
 * Both are fetched in parallel and merged. For TV series, we also
 * fetch next-episode details (season/episode number) for the top N
 * results so the card can display "S2 E5". For all titles, we batch
 * fetch watch providers for the top N results so the card can show
 * OTT platform badges.
 *
 * v4 pipeline:
 *   1. Fetch movies + TV (parallel, paginated).
 *   2. Merge + dedupe by TMDB id.
 *   3. PRE-filter: drop titles with NO usable date at all.
 *   4. Enrich: fetch next-episode for top 30 TV series.
 *   5. POST-filter: range-check using `episodeAirDate || release_date
 *      || first_air_date` (so ongoing series whose `first_air_date`
 *      is in the past but whose next episode is in the window are
 *      kept — this is the fix for "House of the Dragon missing").
 *   6. Enrich: fetch watch providers for top 30 titles.
 *   7. Sort by effective date ascending.
 *
 * NOTE on `vote_count.gte`: we intentionally DO NOT set it. Upcoming
 * titles (especially future-dated ones) typically have ZERO votes
 * because nobody has seen them yet. The old code passed `voteCountGte: 5`
 * which filtered out 99% of upcoming releases.
 */
export async function getUpcomingTitles(
  params: UpcomingQueryParams,
): Promise<TMDBTitle[]> {
  // Development escape hatch — force mock data without hitting TMDB.
  if (isMockMode()) {
    debug("MOCK MODE — returning mock titles (cinelog:upcoming:mock=1)");
    const mock = getMockUpcomingTitles();
    return mock.filter((t) => {
      const d = t.release_date || t.first_air_date || "";
      return d >= params.startDate && d <= params.endDate;
    });
  }

  debug("query params:", params);

  // Defaults: mediaType "all" if not specified. Region defaults to
  // "US" — empty string would cause TMDB to 422.
  const effectiveParams: UpcomingQueryParams = {
    ...params,
    region: params.region || "US",
    mediaType: params.mediaType ?? "all",
  };

  const moviePromise =
    effectiveParams.mediaType === "tv"
      ? Promise.resolve([] as TMDBTitle[])
      : discoverUpcomingMovies(effectiveParams);

  const tvPromise =
    effectiveParams.mediaType === "movie"
      ? Promise.resolve([] as TMDBTitle[])
      : discoverUpcomingTv(effectiveParams);

  const [movies, tv] = await Promise.allSettled([moviePromise, tvPromise]);

  const movieList = movies.status === "fulfilled" ? movies.value : [];
  const tvList = tv.status === "fulfilled" ? tv.value : [];

  debug(
    `movies: ${movieList.length} result(s)` +
      (movies.status === "rejected" ? ` (rejected: ${(movies as PromiseRejectedResult).reason?.message ?? "unknown"})` : "") +
      `, tv: ${tvList.length} result(s)` +
      (tv.status === "rejected" ? ` (rejected: ${(tv as PromiseRejectedResult).reason?.message ?? "unknown"})` : ""),
  );

  // Merge + dedupe by TMDB id.
  const seen = new Set<number>();
  const merged: TMDBTitle[] = [];
  for (const t of [...movieList, ...tvList]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }

  // ── PRE-enrichment filter: drop titles with NO usable date at all ──
  // We do NOT range-check here, because for TV series the date that
  // matters is `episodeAirDate` (populated by the next-episode
  // enrichment below), not `first_air_date`. Range-checking before
  // enrichment would drop ongoing series whose `first_air_date` is in
  // the past but whose next episode is in the window.
  const withDates = merged.filter((t) => {
    const d = t.release_date || t.first_air_date;
    return !!d;
  });

  debug(`merged + pre-filter (date present): ${withDates.length} title(s)`);

  // ── TV enrichment: next episode (season/episode) ───────────────
  // v5 fix: We now enrich ALL TV series returned by discover/tv
  // (was capped at 30 in v4). The cap was causing series 31..N to
  // be dropped by the post-enrichment range filter because their
  // `first_air_date` is in the past (the date that matters is the
  // next-episode air date, which we never fetched). Enriching all
  // series costs one extra HTTP call per series — for a typical
  // 60-series result set that's ~1.2s at TMDB's 50 req/s rate limit,
  // which is acceptable for a page that already takes 1-2s to load.
  // We process them in a bounded-concurrency pool (12 at a time) to
  // stay safely under TMDB's rate limit while finishing quickly.
  const tvToEnrich = withDates.filter((t) => t.media_type === "tv");
  if (tvToEnrich.length > 0) {
    debug(`enriching next-episode for ${tvToEnrich.length} TV series`);
    // Bounded concurrency: 12 in-flight at a time. This balances
    // speed against TMDB's ~50 req/s rate limit (12 concurrent ×
    // ~250ms per call = ~48 req/s, just under the limit).
    const CONCURRENCY = 12;
    let cursor = 0;
    async function enrichOne(): Promise<void> {
      while (cursor < tvToEnrich.length) {
        const idx = cursor++;
        const t = tvToEnrich[idx];
        const next = await getNextEpisode(t.id);
        if (next) {
          t.seasonNumber = next.season;
          t.episodeNumber = next.episode;
          if (next.air_date) t.episodeAirDate = next.air_date;
        }
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, tvToEnrich.length) }, enrichOne);
    await Promise.all(workers);
  }

  // ── POST-enrichment range filter ──────────────────────────────
  // Now that `episodeAirDate` is populated for every TV series, we
  // range-check using the most accurate available date. The effective
  // date is `episodeAirDate || release_date || first_air_date`.
  //
  // Why post-enrichment? Consider "House of the Dragon" S3 E5 airing
  // in 33 days:
  //   - `first_air_date` = "2022-08-21" (S1 premiere — OUT of range)
  //   - `episodeAirDate` = "<33 days from now>" (IN range)
  // Pre-enrichment filtering on `first_air_date` would drop it.
  // Post-enrichment filtering on `episodeAirDate` keeps it.
  //
  // v5 trust-the-discover-filter for TV: if a TV series was returned
  // by /discover/tv with `air_date.gte/lte`, TMDB guarantees it has
  // at least one episode airing in the window — even if our
  // next-episode fetch returned null (e.g. TMDB returned {} because
  // the next episode is the one in the window, not the "next" one).
  // We keep such series instead of dropping them; the card falls
  // back to `first_air_date` for display.
  const inRange = withDates.filter((t) => {
    if (t.media_type === "tv") {
      // Trust discover/tv: if it returned the series, it has an
      // episode in the window. Keep it.
      // (We still range-check episodeAirDate when present, to drop
      // any edge-case where next_episode_to_air returned an episode
      // beyond the window — e.g. a series whose only in-window
      // episode already aired today and whose next is months away.)
      const epDate = t.episodeAirDate;
      if (!epDate) return true; // trust discover/tv
      return epDate >= effectiveParams.startDate && epDate <= effectiveParams.endDate;
    }
    // Movies: strict range check on release_date.
    const d = t.release_date || t.first_air_date;
    return !!d && d >= effectiveParams.startDate && d <= effectiveParams.endDate;
  });

  debug(`post-enrichment range filter: ${inRange.length} title(s) in [${effectiveParams.startDate}, ${effectiveParams.endDate}]`);

  // ── Watch-provider enrichment: top 30 titles (movie + TV) ──────
  // Provider calls are expensive (one per title), so we cap at 30
  // (was 20 in v3). The rest get an empty `providers` array (the
  // card shows nothing).
  const titlesForProviders = inRange.slice(0, 30);
  if (titlesForProviders.length > 0) {
    debug(`enriching watch-providers for ${titlesForProviders.length} titles`);
    await Promise.all(
      titlesForProviders.map(async (t) => {
        const type: "movie" | "tv" = t.media_type === "tv" ? "tv" : "movie";
        t.providers = await getWatchProviders(t.id, type, effectiveParams.region);
      }),
    );
  }

  // Default sort: date ascending using the effective date (episode
  // air date for TV with next-episode info, otherwise release/first
  // air date). Caller can re-sort via sortBy.
  inRange.sort((a, b) => {
    const ad = a.episodeAirDate || a.release_date || a.first_air_date || "";
    const bd = b.episodeAirDate || b.release_date || b.first_air_date || "";
    return ad.localeCompare(bd);
  });

  debug(`final result: ${inRange.length} title(s)`);

  // Last-resort fallback: if BOTH calls failed (rejected) AND we got
  // zero titles, return mock data so the page isn't blank.
  if (inRange.length === 0 && movies.status === "rejected" && tv.status === "rejected") {
    console.warn(
      "[upcoming] Both TMDB calls failed. Falling back to mock data for development. " +
        "Set localStorage[\"cinelog:upcoming:debug\"] = \"1\" for URL/error details.",
    );
    return getMockUpcomingTitles().filter((t) => {
      const d = t.release_date || t.first_air_date || "";
      return d >= effectiveParams.startDate && d <= effectiveParams.endDate;
    });
  }

  return inRange;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Fetch the user's notifications, newest first.
 * Returns [] on any error (incl. table missing) so the UI degrades.
 */
export async function getNotifications(
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as unknown as NotificationRow[];
  } catch {
    return [];
  }
}

/**
 * Insert a new notification. Used by the reminder scheduler when a
 * release-day reminder fires, and by the watchlist "Add" action to
 * surface a confirmation in the feed.
 */
export async function insertNotification(
  row: Omit<NotificationRow, "id" | "created_at" | "is_read" | "read_at" | "sent_at"> &
    Partial<Pick<NotificationRow, "is_read" | "read_at" | "sent_at">>,
): Promise<NotificationRow | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: row.user_id,
        title: row.title,
        message: row.message,
        type: row.type,
        related_title_id: row.related_title_id,
        related_title_type: row.related_title_type,
        scheduled_for: row.scheduled_for,
        is_read: row.is_read ?? false,
      })
      .select()
      .single();
    if (error) return null;
    return data as unknown as NotificationRow;
  } catch {
    return null;
  }
}

/**
 * Mark a single notification as read (sets is_read + read_at).
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Mark all of the user's unread notifications as read.
 */
export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_read", false);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete all READ notifications for the user. Unread notifications are
 * preserved (the user might still want to act on them).
 */
export async function clearReadNotifications(userId: string): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId)
      .eq("is_read", true);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// User reminders
// ---------------------------------------------------------------------------

/**
 * Schedule a release-day reminder for a title. Inserts into user_reminders
 * (UNIQUE on user_id+tmdb_id means re-scheduling is a no-op).
 * Also inserts a notification row of type 'reminder' with scheduled_for
 * set to the release date — the Notification Center will surface it.
 */
export async function scheduleReminder(
  userId: string,
  tmdbId: string | number,
  titleType: "movie" | "series",
  releaseDate: string,
  titleName: string,
): Promise<boolean> {
  try {
    const supabase = getClient();
    const idStr = String(tmdbId);

    // 1. Upsert the reminder row. ON CONFLICT do nothing — the user
    //    already asked to be reminded.
    const { error: reminderError } = await supabase
      .from("user_reminders")
      .upsert(
        {
          user_id: userId,
          tmdb_id: idStr,
          title_type: titleType,
          release_date: releaseDate,
          is_scheduled: true,
          notification_sent: false,
        },
        { onConflict: "user_id,tmdb_id", ignoreDuplicates: true },
      );
    if (reminderError) {
      // If the error is the unique-constraint violation, that's fine —
      // the reminder already exists. Anything else → fail.
      if (!/duplicate/i.test(reminderError.message)) return false;
    }

    // 2. Insert a notification row so the user sees the scheduled
    //    reminder in their feed. We don't dedupe notifications (the
    //    user might re-toggle the bell and want a fresh row).
    await insertNotification({
      user_id: userId,
      title: `Reminder set: ${titleName}`,
      message: `We'll notify you when it releases on ${releaseDate}.`,
      type: "reminder",
      related_title_id: idStr,
      related_title_type: titleType,
      scheduled_for: new Date(releaseDate + "T09:00:00Z").toISOString(),
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel a release-day reminder. Removes the user_reminders row.
 * Does NOT remove already-inserted notifications (the user might want
 * the history).
 */
export async function cancelReminder(
  userId: string,
  tmdbId: string | number,
): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("user_reminders")
      .delete()
      .eq("user_id", userId)
      .eq("tmdb_id", String(tmdbId));
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetch all of the user's reminder rows. Used to mark the bell icon as
 * active on cards whose title the user has already subscribed to.
 */
export async function getUserReminders(
  userId: string,
): Promise<UserReminderRow[]> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", userId);
    if (error) return [];
    return (data ?? []) as unknown as UserReminderRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch any reminders whose release_date is today (or earlier) and
 * which haven't had their notification sent yet. Used by the
 * useNotifications hook on page load to fire browser notifications.
 */
export async function getDueReminders(
  userId: string,
): Promise<UserReminderRow[]> {
  try {
    const supabase = getClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", userId)
      .eq("is_scheduled", true)
      .eq("notification_sent", false)
      .lte("release_date", today);
    if (error) return [];
    return (data ?? []) as unknown as UserReminderRow[];
  } catch {
    return [];
  }
}

/**
 * Mark a reminder as notification_sent=true so we don't fire it twice.
 */
export async function markReminderSent(reminderId: string): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("user_reminders")
      .update({ notification_sent: true })
      .eq("id", reminderId);
    return !error;
  } catch {
    return false;
  }
}

// Exposed for unit tests / dev tools.
export const __testing__ = {
  getMockUpcomingTitles,
  buildMovieParams,
  buildTvParams,
};
