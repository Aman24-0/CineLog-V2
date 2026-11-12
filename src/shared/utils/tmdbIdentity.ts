// src/shared/utils/tmdbIdentity.ts
//
// Resolve a TMDB identity (media_type + id) BEFORE it is written to the
// vault.
//
// THE BUG THIS FIXES
// ------------------
// The add-to-vault path used to trust whatever `/search/multi` returned.
// TMDB's search index can return entries that no longer exist (duplicate
// movie entries created for TV shows get deleted/merged by moderators).
// Saving one produced a permanent orphan vault row:
//   • details page → /movie/<dead-id> → 404 → "Movie not found"
//   • library card → no metadata → "Untitled" / "NO POSTER"
//   • and no way to delete it, because delete lives behind the details page
//
// This helper makes the write path honest:
//   • primary media_type/id exists            → ok (no change)
//   • primary 404s but the OTHER type exists  → ok + corrected media_type
//     (a movie-typed duplicate of a series is silently healed into the
//      real series)
//   • both 404                                → "missing" (caller refuses
//      the add and shows a message)
//   • network/5xx/timeout                     → "unknown" (caller proceeds,
//      we never block a save because TMDB hiccuped)

import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { TMDBError } from "~/core/tmdb/fetchHelpers";
import type { TMDBTitle } from "~/shared/types";

export type TmdbMediaType = "movie" | "tv";

export type TmdbIdentityResult =
  | {
      status: "ok";
      mediaType: TmdbMediaType;
      id: number;
      /** True when the entry only exists under the other media type. */
      corrected: boolean;
      metadata: TMDBTitle;
    }
  | { status: "missing"; mediaType: TmdbMediaType; id: number }
  | { status: "unknown"; mediaType: TmdbMediaType; id: number };

type Probe =
  | { ok: true; metadata: TMDBTitle }
  | { ok: false; notFound: boolean };

async function probe(
  mediaType: TmdbMediaType,
  id: number | string
): Promise<Probe> {
  try {
    const metadata = await fetchTmdbMetadata(mediaType, id);
    // fetchTmdbMetadata returns null for ids already known to 404.
    if (metadata) return { ok: true, metadata };
    return { ok: false, notFound: true };
  } catch (err) {
    if (err instanceof TMDBError && err.status === 404) {
      return { ok: false, notFound: true };
    }
    // 5xx / timeout / offline — we cannot prove the title is dead.
    return { ok: false, notFound: false };
  }
}

/**
 * Verify that a TMDB entry still exists, and heal a wrong media_type.
 *
 * Cheap: `fetchTmdbMetadata` goes through the shared 10-minute apiCache, so
 * a title the user just saw in search costs zero extra requests.
 */
export async function resolveTmdbIdentity(
  mediaType: TmdbMediaType,
  id: number | string
): Promise<TmdbIdentityResult> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return { status: "missing", mediaType, id: numericId };
  }

  const primary = await probe(mediaType, numericId);
  if (primary.ok) {
    return {
      status: "ok",
      mediaType,
      id: numericId,
      corrected: false,
      metadata: primary.metadata
    };
  }
  if (!primary.notFound) {
    return { status: "unknown", mediaType, id: numericId };
  }

  const otherType: TmdbMediaType = mediaType === "movie" ? "tv" : "movie";
  const alternate = await probe(otherType, numericId);
  if (alternate.ok) {
    return {
      status: "ok",
      mediaType: otherType,
      id: numericId,
      corrected: true,
      metadata: alternate.metadata
    };
  }
  if (!alternate.notFound) {
    return { status: "unknown", mediaType, id: numericId };
  }

  return { status: "missing", mediaType, id: numericId };
}
