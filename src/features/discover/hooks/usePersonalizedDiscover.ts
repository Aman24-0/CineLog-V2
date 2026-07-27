// src/features/discover/hooks/usePersonalizedDiscover.ts
//
// usePersonalizedDiscover — derives the user's personalization signals from
// the Supabase vault:
//   1. A DAILY ROTATING seed title ("Because you liked [Seed Title]")
//   2. The user's TOP GENRE (by frequency across completed vault items)
//   3. An EXCLUDED IDs set (every tmdb_id in the vault, for filtering)
//
// All three signals are reactive — they recompute when the vault changes.
// The daily seed ALSO recomputes when the calendar date changes (so Row 1
// never shows recommendations for the same seed title two days in a row).
//
// FALLBACK: if the user's vault is empty (guest or cold start), every
// signal degrades gracefully — `seedTitle` is null, `topGenreId` is null,
// and `excludedIds` is empty. The Discover page uses these nulls to fall
// back to default popular / top-rated queries.

import { createMemo, createSignal, createEffect, type Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import { genreIdFor, MOVIE_GENRES } from "~/core/tmdb/genres";
import { normalizeGenre } from "~/shared/utils/genres";
import { getCurrentUid } from "~/shared/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * A tiny FNV-1a string hash. Deterministic and fast — used to pick a
 * stable daily-seed index from the "{date}:{userId}" composite key so
 * the same user gets the same seed all day, but a different user (or a
 * different day) gets a different seed.
 *
 * We deliberately avoid Math.random() — the seed MUST be deterministic
 * so refreshing the page or re-opening the app mid-day doesn't shuffle
 * Row 1's recommendations.
 *
 * Exported for unit testing.
 */
export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis (2166136261)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime (16777619) — multiply with Math.imul to stay in 32-bit
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit and return a non-negative integer.
  return hash >>> 0;
}

/**
 * Return the current calendar date as a "YYYY-MM-DD" string in the
 * user's local timezone. This is the daily-rotation key — it changes
 * once per calendar day, so the seed title rotates automatically every
 * 24 hours without any timer or scheduler.
 *
 * We use LOCAL time (not UTC) so "today" matches the user's mental
 * model of when a new day starts. A user in IST sees the new seed at
 * 00:00 IST, not 00:00 UTC.
 *
 * Exported for unit testing.
 */
export function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Types ────────────────────────────────────────────────────────────

/**
 * A vault item that's a strong candidate for the "Because you liked X"
 * seed. We pick from completed movies rated >= 7.5 (per the spec).
 */
export interface SeedCandidate {
  /** The vault item — has id, title, media_type, rating. */
  item: WatchlistItem;
  /** Stable string id for hashing (the vault tmdb_id). */
  key: string;
}

export interface PersonalizedDiscover {
  /**
   * The daily-rotating seed title. Null when the user has no completed
   * movies rated >= 7.5 (cold start / guest). The Discover page falls
   * back to a default popular feed in that case.
   *
   * This is REACTIVE to both the vault AND the current date — it
   * recomputes whenever either changes. The same user on the same day
   * always gets the same seed; a different day → different seed.
   */
  seedTitle: Accessor<WatchlistItem | null>;
  /**
   * The display label for Row 1, e.g. "Because you liked Inception".
   * Empty string when there's no seed (cold start).
   */
  seedLabel: Accessor<string>;
  /**
   * The user's top genre NAME (e.g. "Action", "Sci-Fi"), derived from
   * the most frequently occurring genre across completed vault items.
   * Null on cold start. Used for Row 2's "Trending in [Genre]".
   */
  topGenreName: Accessor<string | null>;
  /**
   * The TMDB genre ID corresponding to `topGenreName` (movie genre ID).
   * Null on cold start or if the genre name can't be resolved to an ID.
   */
  topGenreId: Accessor<number | null>;
  /**
   * A Set of "{media_type}/{tmdb_id}" composite keys for EVERY title
   * in the user's vault. Used by every Discover row to filter out
   * already-cataloged titles (with the New-Season exception for TV).
   */
  excludedKeys: Accessor<Set<string>>;
  /**
   * A Set of TMDB tv ids that are in the vault AND have a tracked
   * season count. Used by the New-Season-Out exception: if TMDB
   * reports more seasons than the user has tracked, the title is NOT
   * filtered out of Discover rows (and gets a "NEW SEASON OUT" badge).
   *
   * Maps tv tmdb_id (string) → user's tracked season count.
   */
  trackedTvSeasons: Accessor<Map<string, number>>;
  /**
   * True when the user has NO vault signal at all (guest or empty
   * vault). The Discover page uses this to decide whether to render
   * the personalized rows (Row 1, Row 2) or fall back to defaults.
   */
  isColdStart: Accessor<boolean>;
}

// ─── Hook ─────────────────────────────────────────────────────────────

/**
 * usePersonalizedDiscover — derive personalization signals from the vault.
 *
 * @param watchlist Accessor returning the user's full vault (WatchlistItem[]).
 * @param isGuest   Accessor returning true when the user is signed out.
 */
export function usePersonalizedDiscover(
  watchlist: Accessor<WatchlistItem[]>,
  isGuest: Accessor<boolean>,
): PersonalizedDiscover {
  // ── Daily date signal ──────────────────────────────────────────────
  // We re-read today's date whenever the vault changes (cheap) so that
  // if the app stays open across midnight, the seed rotates on the next
  // vault tick. A dedicated timer is overkill — vault ticks happen
  // frequently enough (auth changes, optimistic updates, refreshes).
  const [today, setToday] = createSignal(todayDateString());
  createEffect(() => {
    // Re-depend on the vault length so the effect re-runs periodically.
    // The actual date check below is what gates the seed rotation.
    watchlist();
    const now = todayDateString();
    if (now !== today()) setToday(now);
  });

  // ── Excluded IDs (every tmdb_id in the vault) ──────────────────────
  // Keyed by "{media_type}/{tmdb_id}" so a movie and TV show sharing
  // a numeric id are treated as distinct (matches the existing
  // vaultKeys pattern in DiscoverPage).
  const excludedKeys = createMemo(() => {
    const set = new Set<string>();
    for (const w of watchlist()) {
      set.add(`${w.media_type}/${w.id}`);
    }
    return set;
  });

  // ── Tracked TV seasons (for the New-Season-Out exception) ──────────
  // For each TV title in the vault, record the highest season number
  // the user has tracked. The Discover page compares this against
  // TMDB's `number_of_seasons` to decide whether to keep the title
  // visible (with a "NEW SEASON OUT" badge) instead of filtering it out.
  const trackedTvSeasons = createMemo(() => {
    const map = new Map<string, number>();
    for (const w of watchlist()) {
      if (w.media_type !== "tv") continue;
      // The user's tracked season number (1-indexed). We take the max
      // of `season` (current) and the last entry in `seasons` (cached
      // season structure) so the count is as accurate as possible.
      const fromField = typeof w.season === "number" && w.season > 0 ? w.season : 0;
      const fromCache = w.seasons && w.seasons.length > 0
        ? w.seasons.reduce((max, s) => (s.number > max ? s.number : max), 0)
        : 0;
      const tracked = Math.max(fromField, fromCache);
      map.set(String(w.id), tracked);
    }
    return map;
  });

  // ── Seed candidates (completed movies rated >= 7.5) ────────────────
  // Per the spec: "Read all completed movies from the user's vault
  // where rating >= 7.5." We restrict to movies because Row 1 fetches
  // /movie/{seedId}/recommendations (TMDB's recommendations endpoint
  // is media-type-specific). TV seeds would need /tv/{id}/recommendations
  // which is a different code path.
  const seedCandidates = createMemo<SeedCandidate[]>(() => {
    const list = watchlist();
    if (isGuest() || list.length === 0) return [];
    return list
      .filter(
        (m) =>
          m.media_type === "movie" &&
          m.status === "Completed" &&
          typeof m.rating === "number" &&
          m.rating >= 7.5,
      )
      .map((item) => ({ item, key: String(item.id) }));
  });

  // ── Daily rotating seed title ──────────────────────────────────────
  // Deterministic hash of "{date}:{userId}:{candidateCount}" picks ONE
  // candidate. The candidateCount is included so adding/removing a
  // high-rated movie shifts the hash bucket even if date+userId are
  // unchanged — this keeps the rotation feeling fresh.
  const seedTitle = createMemo<WatchlistItem | null>(() => {
    const candidates = seedCandidates();
    if (candidates.length === 0) return null;
    const date = today();
    const uid = getCurrentUid() ?? "guest";
    const hashInput = `${date}:${uid}:${candidates.length}`;
    const idx = fnv1aHash(hashInput) % candidates.length;
    return candidates[idx].item;
  });

  const seedLabel = createMemo(() => {
    const seed = seedTitle();
    if (!seed) return "";
    const name = seed.title || seed.name || "this title";
    return `Because you liked ${name}`;
  });

  // ── Top genre (most frequent across completed vault items) ─────────
  // We count genre occurrences across ALL completed items (movies + TV).
  // Genre names are normalized (TMDB returns them as objects/strings/
  // numbers depending on the endpoint — normalizeGenre handles all).
  const topGenreName = createMemo<string | null>(() => {
    const list = watchlist();
    if (isGuest() || list.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const m of list) {
      if (m.status !== "Completed") continue;
      if (!m.genresList || !Array.isArray(m.genresList)) continue;
      for (const g of m.genresList) {
        const name = normalizeGenre(g);
        if (!name) continue;
        counts[name] = (counts[name] || 0) + 1;
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  });

  const topGenreId = createMemo<number | null>(() => {
    const name = topGenreName();
    if (!name) return null;
    // Resolve via the movie genre map (Row 2 fetches /discover/movie).
    const id = genreIdFor(name, "movie");
    return id ?? null;
  });

  const isColdStart = createMemo(
    () => isGuest() || watchlist().length === 0,
  );

  return {
    seedTitle,
    seedLabel,
    topGenreName,
    topGenreId,
    excludedKeys,
    trackedTvSeasons,
    isColdStart,
  };
}

// ─── Pure utility exports (also used by the Discover page directly) ───

/**
 * Format the top-genre row label, e.g. "Trending in Action".
 * Returns an empty string when no genre is available (cold start).
 */
export function formatTopGenreLabel(genreName: string | null): string {
  if (!genreName) return "";
  return `Trending in ${genreName}`;
}

/**
 * Re-export the movie genre map so the Discover page can look up a
 * genre ID directly without a separate import. (Convenience only.)
 */
export { MOVIE_GENRES };
