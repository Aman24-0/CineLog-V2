// src/shared/utils/seenTitles.ts
//
// CineLog V2 — Spotlight "seen titles" tracker + daily pick cache.
// -----------------------------------------------------------------
// Two responsibilities:
//
//   1. SEEN TITLES — a per-user list of every TMDB title that has
//      been shown in the Spotlight, with the timestamp it was shown.
//      Used to enforce the "no repeat within 30 days" rule. When the
//      user shuffles (skips) a title, it is also added here, so the
//      skipped title won't reappear for 30 days either.
//
//   2. DAILY CACHE — a single cached SpotlightPick per user, tagged
//      with the day it was picked (YYYY-MM-DD). On app load, if the
//      cached date matches today, we restore the cached pick instead
//      of refetching — this is what makes the Spotlight feel "locked
//      for the day" without an API call. Shuffling invalidates the
//      cache and replaces it with the new pick for the rest of the day.
//
// Storage layout (localStorage):
//   • cinelog:spotlight:seen:{userId}    → JSON map of "mediaType:tmdbId" → timestamp
//   • cinelog:spotlight:current:{userId} → JSON { date, pick }
//
// Guests use a shared `guest` key so two guests on the same browser
// share the same rotation (acceptable — guests have no personalization
// anyway, and we'd rather not pollute localStorage with one key per
// anonymous session).
//
// SSR safety: every read/write checks `typeof window` first. On the
// server, all reads return empty/null and all writes are no-ops.

import type { SpotlightPick } from "~/shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long a seen title stays excluded from future Spotlight picks. */
export const SEEN_TITLES_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns the localStorage key for the seen-titles map. */
function seenKey(userId: string | null): string {
  return `cinelog:spotlight:seen:${userId ?? "guest"}`;
}

/** Returns the localStorage key for the current (cached) pick. */
function currentKey(userId: string | null): string {
  return `cinelog:spotlight:current:${userId ?? "guest"}`;
}

/** True when running in a browser with localStorage access. */
function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

/** Stored shape: { "movie:123": 1700000000000, "tv:456": 1700000001000 }. */
type SeenMap = Record<string, number>;

/** Build a stable key for a single title. */
function titleKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/** Read + parse the seen-titles map. Returns {} on any error. */
function readSeen(userId: string | null): SeenMap {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(seenKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as SeenMap;
  } catch {
    return {};
  }
}

/** Serialize + write the seen-titles map. Silently no-ops on failure. */
function writeSeen(userId: string | null, map: SeenMap): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(seenKey(userId), JSON.stringify(map));
  } catch (err) {
    // Quota exceeded or serialization error — non-fatal. The Spotlight
    // will still work, just without the no-repeat guarantee persisting
    // across sessions.
    console.warn("[seenTitles] Failed to write seen titles:", err);
  }
}

// ---------------------------------------------------------------------------
// Public API — Seen titles
// ---------------------------------------------------------------------------

/**
 * Record that a title was shown to the user (or skipped via shuffle).
 * The timestamp defaults to Date.now() but can be overridden for tests.
 *
 * Idempotent — adding the same title twice simply updates its timestamp.
 */
export function addSeenTitle(
  userId: string | null,
  mediaType: string,
  tmdbId: number,
  timestamp: number = Date.now(),
): void {
  const map = readSeen(userId);
  map[titleKey(mediaType, tmdbId)] = timestamp;
  writeSeen(userId, map);
}

/**
 * Check if a title has been shown to the user within the last 30 days.
 * Returns `false` for titles never seen, or seen more than 30 days ago
 * (those are pruned automatically and become eligible again).
 */
export function isTitleSeen(
  userId: string | null,
  mediaType: string,
  tmdbId: number,
): boolean {
  const map = readSeen(userId);
  const ts = map[titleKey(mediaType, tmdbId)];
  if (!ts) return false;
  return Date.now() - ts < SEEN_TITLES_TTL_MS;
}

/**
 * Return the full seen-titles map (with expired entries pruned).
 * The map keys are `"mediaType:tmdbId"` strings and values are timestamps.
 *
 * Side-effect: if any expired entries were found during the read, they
 * are removed from localStorage so the storage doesn't grow unbounded
 * over months/years of usage.
 */
export function getSeenTitles(userId: string | null): Map<string, number> {
  const map = readSeen(userId);
  const now = Date.now();
  const result = new Map<string, number>();
  let pruned = false;

  for (const [key, ts] of Object.entries(map)) {
    if (typeof ts !== "number") {
      pruned = true;
      continue;
    }
    if (now - ts < SEEN_TITLES_TTL_MS) {
      result.set(key, ts);
    } else {
      pruned = true;
    }
  }

  // Persist the pruned map back to localStorage so we don't repeatedly
  // re-read stale entries on every Spotlight fetch.
  if (pruned) {
    const cleaned: SeenMap = {};
    result.forEach((ts, key) => { cleaned[key] = ts; });
    writeSeen(userId, cleaned);
  }

  return result;
}

/** Clear all seen-titles state for a user. Used in tests + the reset flow. */
export function clearSeenTitles(userId: string | null): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(seenKey(userId));
  } catch (err) {
    console.warn("[seenTitles] Failed to clear seen titles:", err);
  }
}

// ---------------------------------------------------------------------------
// Public API — Daily cache (current Spotlight pick)
// ---------------------------------------------------------------------------

interface CachedSpotlight {
  /** YYYY-MM-DD — the day this pick was cached for. */
  date: string;
  /** The serialized SpotlightPick. */
  pick: SpotlightPick;
}

/**
 * Read today's (or a previous day's) cached Spotlight pick.
 * Returns null if nothing is cached or the cache is corrupt.
 *
 * Does NOT check whether the date matches today — the caller decides
 * whether to reuse a stale cache or invalidate it.
 */
export function getCachedSpotlight(userId: string | null): CachedSpotlight | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(currentKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.date !== "string" ||
      typeof parsed.pick !== "object" ||
      parsed.pick === null
    ) {
      return null;
    }
    return parsed as CachedSpotlight;
  } catch {
    return null;
  }
}

/**
 * Cache a Spotlight pick as "today's pick" so a page refresh restores
 * the same title instead of refetching. The date is captured at write
 * time, so the cache is valid only for the day it was written.
 */
export function setCachedSpotlight(
  userId: string | null,
  pick: SpotlightPick,
): void {
  if (!hasLocalStorage()) return;
  try {
    const cached: CachedSpotlight = { date: todayKey(), pick };
    window.localStorage.setItem(currentKey(userId), JSON.stringify(cached));
  } catch (err) {
    // Quota exceeded — non-fatal. We just won't have a cache hit on
    // the next refresh.
    console.warn("[seenTitles] Failed to cache spotlight:", err);
  }
}

/** Remove the cached daily pick (used by shuffle + reset). */
export function clearCachedSpotlight(userId: string | null): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(currentKey(userId));
  } catch (err) {
    console.warn("[seenTitles] Failed to clear cached spotlight:", err);
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Return today's date as a stable `YYYY-MM-DD` string in the user's
 * local timezone. This is the key used to determine when a cached
 * Spotlight pick is stale (a new day → a new pick).
 */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
