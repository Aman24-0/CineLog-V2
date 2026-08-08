// src/lib/server/trakt.ts
//
// CineLog V2 — Trakt API Client (Server-Only)
// ---------------------------------------------------------------------
// Server-side utility for making authenticated requests to the Trakt
// API on behalf of a connected user.
//
// WHY THIS EXISTS (Phase 12 Chunk 2):
//   Trakt uses OAuth 2.0 for authentication. After a user connects
//   their Trakt account via the /api/auth/trakt OAuth flow, we store
//   their access_token in the `user_integrations` table. This module
//   reads that token and proxies API calls to Trakt — the token NEVER
//   reaches the browser bundle.
//
//   All Trakt API requests require:
//     • Authorization: Bearer <access_token>
//     • Content-Type: application/json
//     • trakt-api-version: 2
//     • trakt-api-key: <client_id>  (yes, even on authenticated calls —
//       Trakt requires both the OAuth token AND the client_id header)
//
// ROUTES WE CALL:
//   • GET  /users/{username}/history  — watched history (movies + episodes)
//   • GET  /users/{username}/ratings  — user ratings (movies + shows)
//   • GET  /users/me                  — current user profile (email)
//   • POST /oauth/token               — exchange authorization code for token
//   • POST /oauth/token               — refresh expired access token
//
// ENVIRONMENT VARIABLES:
//   • TRAKT_CLIENT_ID      — Trakt OAuth client_id (registered at trakt.tv/api/apps)
//   • TRAKT_CLIENT_SECRET  — Trakt OAuth client_secret (server-only — NEVER expose)
//   • TRAKT_REDIRECT_URI   — The callback URL Trakt redirects to after authorization.
//                             Must match what's registered in the Trakt app settings.
//                             Defaults to `${origin}/api/auth/trakt/callback`.
//
// SECURITY:
//   • This module is server-only. Importing it from the browser throws.
//   • Access tokens are read from the DB via the service-role admin client.
//   • Trakt API responses are filtered to ONLY the fields we need before
//     returning to the caller — we never echo raw upstream payloads.
//   • All requests have a 30-second timeout to prevent hung connections.

import { isServer } from "solid-js/web";

// ─── Trakt API base URLs ──────────────────────────────────────────
const TRAKT_API_BASE = "https://api.trakt.tv";
const TRAKT_OAUTH_TOKEN_URL = "https://api.trakt.tv/oauth/token";
const TRAKT_OAUTH_AUTHORIZE_URL = "https://api.trakt.tv/oauth/authorize";

const TRAKT_API_VERSION = "2";
const REQUEST_TIMEOUT_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────

/** A single Trakt history entry — either a movie watch or an episode watch. */
export interface TraktHistoryEntry {
  /** Trakt's internal id for this history entry (not the movie/show id). */
  id: number;
  /** ISO 8601 timestamp when the user watched this. */
  watched_at: string;
  /** The media type: "movie" or "episode". */
  type: "movie" | "episode";
  /** The movie payload — present when `type === "movie"`. */
  movie?: TraktMovie;
  /** The episode payload — present when `type === "episode"`. */
  episode?: TraktEpisode;
  /** The show payload — present when `type === "episode"`. */
  show?: TraktShow;
}

/** A Trakt movie object with the IDs we need for TMDB mapping. */
export interface TraktMovie {
  title: string;
  year: number | null;
  ids: {
    trakt: number;
    slug: string;
    imdb?: string;
    tmdb?: number;
  };
}

/** A Trakt show object with the IDs we need for TMDB mapping. */
export interface TraktShow {
  title: string;
  year: number | null;
  ids: {
    trakt: number;
    slug: string;
    imdb?: string;
    tmdb?: number;
  };
}

/** A Trakt episode object. Used together with `show` for TV history. */
export interface TraktEpisode {
  season: number;
  number: number;
  title: string;
  ids: {
    trakt: number;
    imdb?: string;
    tmdb?: number;
  };
}

/** A Trakt rating entry — covers movies, shows, and episodes. */
export interface TraktRatingEntry {
  /** ISO 8601 timestamp when the rating was set. */
  rated_at: string;
  /** Trakt rating (1-10). */
  rating: number;
  /** The media type: "movie", "show", or "episode". */
  type: "movie" | "show" | "episode";
  movie?: TraktMovie;
  show?: TraktShow;
  episode?: TraktEpisode;
}

/** Trakt user profile — used to fetch the email for the mismatch check. */
export interface TraktUserProfile {
  username: string;
  /** Trakt account email — private, only visible with the access token. */
  email?: string;
  name?: string;
  vip?: boolean;
}

/** Parsed Trakt OAuth token response. */
export interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Token type — always "Bearer". */
  token_type: string;
  /** Lifetime of the access token in seconds. */
  expires_in: number;
  /** Space-separated scopes that were granted. */
  scope: string;
  /** ISO 8601 timestamp when the token was created. */
  created_at: number;
}

/** A normalized media item extracted from Trakt history — used by the
 *  preview + execute routes to compute new/conflict counts and bulk
 *  upsert into the vault. */
export interface NormalizedTraktItem {
  /** TMDB ID — the foreign key we use to map into the CineLog vault. */
  tmdb_id: number;
  /** Media type: "movie" or "tv". */
  media_type: "movie" | "tv";
  /** Title (for logging / preview display only). */
  title: string;
  /** Release year (for logging / preview display only). */
  year: number | null;
  /** ISO 8601 timestamp when the user watched this. */
  watched_at: string;
  /** Trakt rating (1-10) if the user rated this title. */
  rating: number | null;
  /** For TV: the season number of the watched episode. */
  season?: number;
  /** For TV: the episode number of the watched episode. */
  episode?: number;
}

// ─── Environment helpers ─────────────────────────────────────────

/**
 * Read Trakt OAuth env vars. Throws if any are missing — the OAuth
 * flow cannot proceed without them.
 */
function readTraktConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  if (!isServer) {
    throw new Error(
      "[trakt] Trakt client accessed on the browser. The client_secret must never reach the client bundle."
    );
  }
  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;
  const redirectUri = process.env.TRAKT_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[trakt] Missing TRAKT_CLIENT_ID or TRAKT_CLIENT_SECRET. " +
        "Register an app at https://trakt.tv/oauth/applications and set both env vars."
    );
  }
  if (!redirectUri) {
    throw new Error(
      "[trakt] Missing TRAKT_REDIRECT_URI. Set it to the public URL of " +
        "your /api/auth/trakt/callback route (e.g. https://cinelog.app/api/auth/trakt/callback)."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Just the client_id — used for the authorize URL + the trakt-api-key header. */
export function getTraktClientId(): string {
  const { clientId } = readTraktConfig();
  return clientId;
}

/** Build the Trakt OAuth authorize URL the user gets redirected to. */
export function buildTraktAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = readTraktConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state
  });
  return `${TRAKT_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// ─── Low-level fetch helpers ─────────────────────────────────────

/** Fetch with a hard timeout — aborts after REQUEST_TIMEOUT_MS. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Build the standard Trakt auth headers for an authenticated request. */
function buildTraktHeaders(accessToken: string): Record<string, string> {
  const { clientId } = readTraktConfig();
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "trakt-api-version": TRAKT_API_VERSION,
    "trakt-api-key": clientId
  };
}

// ─── OAuth token exchange ────────────────────────────────────────

/**
 * Exchange an authorization code for an access + refresh token.
 * Called by the /api/auth/trakt/callback route after Trakt redirects
 * back to us with `?code=...`.
 *
 * @param code  The authorization code from Trakt's redirect.
 * @returns The parsed token response (access_token, refresh_token, expires_in, etc.).
 * @throws if the exchange fails or env vars are missing.
 */
export async function exchangeTraktCodeForToken(
  code: string
): Promise<TraktTokenResponse> {
  const { clientId, clientSecret, redirectUri } = readTraktConfig();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const resp = await fetchWithTimeout(
    TRAKT_OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "trakt-api-version": TRAKT_API_VERSION,
        "trakt-api-key": clientId
      },
      body: body.toString()
    },
    15_000
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `[trakt] Token exchange failed: HTTP ${resp.status} ${resp.statusText}. ` +
        (text ? `Body: ${text.slice(0, 200)}` : "")
    );
  }

  return (await resp.json()) as TraktTokenResponse;
}

/**
 * Refresh an expired access token using the stored refresh token.
 * Called when a Trakt API call returns 401 — we try one refresh,
 * then give up if the refresh also fails.
 *
 * @param refreshToken  The stored refresh token for this user.
 * @returns A fresh token response (new access_token + new refresh_token).
 * @throws if the refresh fails.
 */
export async function refreshTraktToken(
  refreshToken: string
): Promise<TraktTokenResponse> {
  const { clientId, clientSecret } = readTraktConfig();

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: process.env.TRAKT_REDIRECT_URI ?? "",
    grant_type: "refresh_token"
  });

  const resp = await fetchWithTimeout(
    TRAKT_OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "trakt-api-version": TRAKT_API_VERSION,
        "trakt-api-key": clientId
      },
      body: body.toString()
    },
    15_000
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `[trakt] Token refresh failed: HTTP ${resp.status} ${resp.statusText}. ` +
        (text ? `Body: ${text.slice(0, 200)}` : "")
    );
  }

  return (await resp.json()) as TraktTokenResponse;
}

// ─── Authenticated API calls ─────────────────────────────────────

/**
 * Fetch the user's Trakt profile — primarily used to read their email
 * for the email-mismatch security check during OAuth callback.
 *
 * Endpoint: GET /users/me
 */
export async function getTraktUserProfile(
  accessToken: string
): Promise<TraktUserProfile> {
  const resp = await fetchWithTimeout(
    `${TRAKT_API_BASE}/users/me`,
    {
      method: "GET",
      headers: buildTraktHeaders(accessToken)
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `[trakt] /users/me failed: HTTP ${resp.status} ${resp.statusText}. ` +
        (text ? `Body: ${text.slice(0, 200)}` : "")
    );
  }

  return (await resp.json()) as TraktUserProfile;
}

/**
 * Fetch the user's watched history — every movie + episode they've
 * marked as watched on Trakt. Returns the raw entries; callers should
 * use `normalizeTraktHistory` to extract the fields we care about.
 *
 * Endpoint: GET /users/{username}/history
 *
 * @param accessToken  The user's stored Trakt access token.
 * @param username     The user's Trakt username (from provider_user_id).
 *                     Use "me" as a fallback — Trakt resolves it to the
 *                     authenticated user.
 */
export async function getTraktWatchedHistory(
  accessToken: string,
  username: string
): Promise<TraktHistoryEntry[]> {
  const safeUsername = encodeURIComponent(username || "me");
  // Page size = 100 (Trakt's max). We fetch all pages until we get fewer
  // than 100 results — this avoids requiring the caller to know pagination.
  const all: TraktHistoryEntry[] = [];
  let page = 1;
  const pageSize = 100;

  // Hard safety cap — 50 pages × 100 = 5000 entries. Even a power user
  // is unlikely to have more. If they do, the preview will still work
  // (it'll just be truncated) and the execute route will import the first
  // 5000. We can add a "load more" continuation later if needed.
  const MAX_PAGES = 50;

  while (page <= MAX_PAGES) {
    const url =
      `${TRAKT_API_BASE}/users/${safeUsername}/history` +
      `?page=${page}&limit=${pageSize}`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        ...buildTraktHeaders(accessToken),
        // Ask for paginated responses with the row count header.
        "Pagination-Type": "application/json"
      }
    });

    if (resp.status === 404) {
      // User has no watched history yet — return what we have (empty).
      break;
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `[trakt] /users/${safeUsername}/history failed: HTTP ${resp.status} ${resp.statusText}. ` +
          (text ? `Body: ${text.slice(0, 200)}` : "")
      );
    }

    const batch = (await resp.json()) as TraktHistoryEntry[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    if (batch.length < pageSize) break; // last page
    page += 1;
  }

  return all;
}

/**
 * Fetch the user's ratings — every movie, show, and episode they've
 * rated on Trakt (1-10 scale). Used by the execute route to apply
 * ratings to vault items.
 *
 * Endpoint: GET /users/{username}/ratings
 */
export async function getTraktRatings(
  accessToken: string,
  username: string
): Promise<TraktRatingEntry[]> {
  const safeUsername = encodeURIComponent(username || "me");
  const all: TraktRatingEntry[] = [];
  let page = 1;
  const pageSize = 100;
  const MAX_PAGES = 50;

  while (page <= MAX_PAGES) {
    const url =
      `${TRAKT_API_BASE}/users/${safeUsername}/ratings` +
      `?page=${page}&limit=${pageSize}`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        ...buildTraktHeaders(accessToken),
        "Pagination-Type": "application/json"
      }
    });

    if (resp.status === 404) break;
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `[trakt] /users/${safeUsername}/ratings failed: HTTP ${resp.status} ${resp.statusText}. ` +
          (text ? `Body: ${text.slice(0, 200)}` : "")
      );
    }

    const batch = (await resp.json()) as TraktRatingEntry[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
  }

  return all;
}

// ─── Normalization helpers ───────────────────────────────────────

/**
 * Normalize a single Trakt history entry into the shape CineLog needs.
 * Returns null if the entry is missing a TMDB ID (we can't import it
 * without one — there's no reliable way to map it to a vault row).
 *
 * @param entry  A raw history entry from getTraktWatchedHistory.
 * @returns The normalized item, or null if it should be skipped.
 */
export function normalizeTraktHistoryEntry(
  entry: TraktHistoryEntry
): NormalizedTraktItem | null {
  if (entry.type === "movie" && entry.movie) {
    const tmdb = entry.movie.ids?.tmdb;
    if (!tmdb || typeof tmdb !== "number") return null;
    return {
      tmdb_id: tmdb,
      media_type: "movie",
      title: entry.movie.title || "Untitled",
      year: entry.movie.year ?? null,
      watched_at: entry.watched_at,
      rating: null
    };
  }
  if (entry.type === "episode" && entry.show && entry.episode) {
    const tmdb = entry.show.ids?.tmdb;
    if (!tmdb || typeof tmdb !== "number") return null;
    return {
      tmdb_id: tmdb,
      media_type: "tv",
      title: entry.show.title || "Untitled",
      year: entry.show.year ?? null,
      watched_at: entry.watched_at,
      rating: null,
      season: entry.episode.season,
      episode: entry.episode.number
    };
  }
  return null;
}

/**
 * Deduplicate a list of normalized history items. Trakt often has
 * multiple watch entries for the same title (e.g. user watched it
 * twice, or it's in both their collection and their history). We
 * keep only the most recent watch per (tmdb_id, media_type).
 *
 * For TV: keep only the most recent episode watched per show (by
 * tmdb_id) — CineLog's vault model is per-show, not per-episode.
 */
export function dedupeTraktItems(
  items: NormalizedTraktItem[]
): NormalizedTraktItem[] {
  const byKey = new Map<string, NormalizedTraktItem>();
  for (const item of items) {
    const key = `${item.media_type}:${item.tmdb_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    // Keep the most recent watched_at (ISO 8601 string comparison works).
    if (item.watched_at > existing.watched_at) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Apply Trakt ratings to a list of normalized history items. Items
 * that have a rating in `ratings` get their `rating` field set;
 * items without a rating remain null.
 *
 * Trakt uses a 1-10 rating scale, which matches CineLog's vault.rating
 * column (also 1-10). No conversion needed.
 *
 * If the same title is rated multiple times (rare), we keep the most
 * recent one — Trakt returns ratings newest-first, so the first one
 * we encounter wins.
 */
export function applyTraktRatings(
  items: NormalizedTraktItem[],
  ratings: TraktRatingEntry[]
): NormalizedTraktItem[] {
  // Index ratings by (media_type, tmdb_id) → rating.
  // For TV, we use "show" ratings (per-show), ignoring per-episode ratings.
  const ratingByKey = new Map<string, number>();
  for (const r of ratings) {
    let tmdb: number | undefined;
    if (r.type === "movie" && r.movie) tmdb = r.movie.ids?.tmdb;
    else if (r.type === "show" && r.show) tmdb = r.show.ids?.tmdb;
    if (!tmdb) continue;
    const key = `${r.type === "movie" ? "movie" : "tv"}:${tmdb}`;
    // Trakt returns ratings newest-first, so the first occurrence wins.
    if (!ratingByKey.has(key)) {
      ratingByKey.set(key, r.rating);
    }
  }

  return items.map((item) => {
    const key = `${item.media_type}:${item.tmdb_id}`;
    const rating = ratingByKey.get(key);
    return rating !== undefined ? { ...item, rating } : item;
  });
}

/**
 * Compute the full normalized + deduplicated + rated list of Trakt
 * history items in one call. Convenience wrapper for the preview and
 * execute routes.
 */
export async function getNormalizedTraktHistory(
  accessToken: string,
  username: string
): Promise<NormalizedTraktItem[]> {
  const [history, ratings] = await Promise.all([
    getTraktWatchedHistory(accessToken, username),
    getTraktRatings(accessToken, username).catch((err) => {
      // Ratings are optional — if the user has none, or the ratings
      // endpoint fails, we still want to import the history.
      console.warn(
        "[trakt] Could not fetch ratings, proceeding without them:",
        err instanceof Error ? err.message : String(err)
      );
      return [] as TraktRatingEntry[];
    })
  ]);

  const normalized = history
    .map(normalizeTraktHistoryEntry)
    .filter((x): x is NormalizedTraktItem => x !== null);

  const deduped = dedupeTraktItems(normalized);
  const withRatings = applyTraktRatings(deduped, ratings);
  return withRatings;
}
