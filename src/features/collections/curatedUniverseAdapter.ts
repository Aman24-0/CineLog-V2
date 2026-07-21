/**
 * CineLog V2 — Curated Universe Adapter
 * ---------------------------------------------------------------------
 * Bridges the Supabase `curated_universes` + `curated_universe_entries`
 * tables to the application's `Collection` type.
 *
 * This is the SOLE source of truth for curated universe data in the
 * frontend. There are NO hardcoded curated collections — every universe
 * is fetched from the database via the DiscoverRepository.
 *
 * Architecture:
 *   UI → useCuratedUniverses() → curatedUniverseAdapter → DiscoverRepository → Supabase
 *
 * The adapter maps the raw database rows to the app's `Collection` shape
 * so the existing UI components (UniverseDashboard, TimelineEngine, etc.)
 * can render curated universes without knowing they come from a different
 * table than user collections.
 */

import { getDiscoverRepository } from "~/lib/supabase/repositories";
import type {
  CuratedUniverseRow,
  CuratedUniverseEntryRow,
} from "~/lib/supabase/repositories";
import type { TMDBTitle, Collection, CollectionEntry } from "~/shared/types";

// ---------------------------------------------------------------------------
// Row → Collection mapping
// ---------------------------------------------------------------------------

/**
 * Map a `curated_universes` row to the app's `Collection` shape.
 *
 * Curated universes are read-only and developer-managed. The `type`
 * is always `"curated"`. The `id` is the universe's UUID (not the slug) —
 * the slug is used for routing, the id for database queries.
 */
export function curatedUniverseRowToCollection(
  row: CuratedUniverseRow,
  entries: CollectionEntry[] = [],
): Collection {
  return {
    id: row.id,
    name: row.name,
    type: "curated",
    description: row.description ?? undefined,
    backdrop_path: row.banner_url ?? undefined,
    poster_path: row.cover_url ?? undefined,
    coverImagePath: row.cover_url ?? undefined,
    accentColor: row.color ?? undefined,
    entries,
    // Curated universes support chronological + release orders by default.
    // The `default_view` enum from the DB could map to these in the future.
    viewingOrders: [
      { id: "chronological", label: "Chronological", description: "Story timeline order" },
      { id: "release", label: "Release Order", description: "Theatrical release date order" },
    ],
    defaultOrder: "chronological",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a `curated_universe_entries` row to the app's `CollectionEntry`
 * shape, enriched with TMDB display metadata (title, poster_path, etc.).
 *
 * The `curated_universe_entries` table stores only `tmdb_id` +
 * `media_type` + position fields. Display metadata (title, poster,
 * release_date) is fetched from TMDB and merged in.
 */
export function curatedEntryRowToCollectionEntry(
  row: CuratedUniverseEntryRow,
  tmdb?: TMDBTitle | null,
): CollectionEntry {
  return {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    title: tmdb?.title,
    name: tmdb?.name,
    poster_path: tmdb?.poster_path ?? undefined,
    backdrop_path: tmdb?.backdrop_path ?? undefined,
    release_date: tmdb?.release_date,
    first_air_date: tmdb?.first_air_date,
    order: row.position,
    userNote: row.note ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// READ: Fetch curated universes from Supabase
// ---------------------------------------------------------------------------

/**
 * Fetch ALL curated universes from Supabase — the complete developer-
 * managed catalog. Used by the Add Universe dialog.
 *
 * @returns An array of `Collection` objects (empty if none or error).
 */
export async function fetchAllCuratedUniverses(): Promise<Collection[]> {
  const repo = getDiscoverRepository();
  const { data, error } = await repo.getAllCuratedUniverses();
  if (error) {
    console.error("[curatedUniverseAdapter] Error fetching all curated universes:", error);
    return [];
  }
  return data.map((row) => curatedUniverseRowToCollection(row));
}

/**
 * Fetch a single curated universe by its slug OR id, with entries
 * enriched by TMDB metadata. Used by the Collection Detail page.
 *
 * The route param `id` from `/collections/{id}` can be either:
 *   - a URL-safe slug (e.g. "marvel-cinematic-universe") — used by the
 *     admin "Preview as user" link
 *   - a UUID (e.g. "abc-123-…") — used by the Collections list page
 *     (`navigate(\`/collections/${uni.id}\`)`)
 *
 * We try slug first (cheaper index, more common). If no universe has
 * that slug, fall back to a primary-key lookup by id. This keeps every
 * entry point working without forcing callers to know which identifier
 * they hold.
 *
 * @returns The `Collection`, or null if not found / error.
 */
export async function fetchCuratedUniverseBySlug(
  slugOrId: string,
): Promise<Collection | null> {
  const repo = getDiscoverRepository();

  // 1. Fetch the universe row — try slug first, fall back to id.
  let universe: CuratedUniverseRow | null = null;

  const { data: bySlug, error: slugError } = await repo.getCuratedUniverseBySlug(slugOrId);
  if (slugError) {
    // Log but don't bail — we still want to try the id lookup.
    console.error("[curatedUniverseAdapter] Error fetching universe by slug:", slugError);
  }
  if (bySlug) {
    universe = bySlug;
  } else {
    // No slug match (or slug lookup errored) — try primary-key lookup.
    const { data: byId, error: idError } = await repo.getCuratedUniverseById(slugOrId);
    if (idError) {
      console.error("[curatedUniverseAdapter] Error fetching universe by id:", idError);
    }
    universe = byId;
  }

  if (!universe) return null;

  // 2. Fetch the universe's entries.
  const { data: entryRows, error: entriesError } = await repo.getCuratedUniverseEntries(universe.id);
  if (entriesError) {
    console.error("[curatedUniverseAdapter] Error fetching universe entries:", entriesError);
    return curatedUniverseRowToCollection(universe, []);
  }

  // 3. Batch-fetch TMDB metadata for each entry (title, poster, etc.).
  const tmdbItems = entryRows.map((e) => ({ mediaType: e.media_type, tmdbId: e.tmdb_id }));
  const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
  const tmdbMap = tmdbItems.length > 0
    ? await fetchTmdbMetadataBatch(tmdbItems)
    : new Map<string, TMDBTitle>();

  // 4. Map entries to CollectionEntry with TMDB enrichment.
  const entries = entryRows.map((row) => {
    const tmdbKey = `${row.media_type}/${row.tmdb_id}`;
    const tmdb = tmdbMap.get(tmdbKey) ?? null;
    return curatedEntryRowToCollectionEntry(row, tmdb);
  });

  return curatedUniverseRowToCollection(universe, entries);
}

/**
 * Fetch all universes the user has subscribed to, with entries enriched
 * by TMDB metadata. Used by the Collections page "Subscribed Universes"
 * section.
 *
 * @returns An array of `Collection` objects (empty if none or error).
 */
export async function fetchSubscribedUniverses(userId: string): Promise<Collection[]> {
  const repo = getDiscoverRepository();
  const { data: subscriptions, error } = await repo.getSubscribedUniverses(userId);
  if (error) {
    console.error("[curatedUniverseAdapter] Error fetching subscribed universes:", error);
    return [];
  }

  // Fetch entries for each subscribed universe in parallel.
  const collections = await Promise.all(
    subscriptions.map(async ({ universe }) => {
      const { data: entryRows, error: entriesError } = await repo.getCuratedUniverseEntries(universe.id);
      if (entriesError) {
        console.error("[curatedUniverseAdapter] Error fetching entries for universe:", universe.id, entriesError);
        return curatedUniverseRowToCollection(universe, []);
      }

      // Batch-fetch TMDB metadata for entries.
      const tmdbItems = entryRows.map((e) => ({ mediaType: e.media_type, tmdbId: e.tmdb_id }));
      const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
      const tmdbMap = tmdbItems.length > 0
        ? await fetchTmdbMetadataBatch(tmdbItems)
        : new Map<string, TMDBTitle>();

      const entries = entryRows.map((row) => {
        const tmdbKey = `${row.media_type}/${row.tmdb_id}`;
        const tmdb = tmdbMap.get(tmdbKey) ?? null;
        return curatedEntryRowToCollectionEntry(row, tmdb);
      });

      return curatedUniverseRowToCollection(universe, entries);
    }),
  );

  return collections;
}

// ---------------------------------------------------------------------------
// Subscription state check
// ---------------------------------------------------------------------------

/**
 * Get the set of universe IDs the user has subscribed to.
 * Used by the Add Universe dialog to show "Added" state.
 */
export async function fetchSubscribedUniverseIds(userId: string): Promise<Set<string>> {
  const repo = getDiscoverRepository();
  const { data, error } = await repo.getSubscribedUniverses(userId);
  if (error) {
    console.error("[curatedUniverseAdapter] Error fetching subscribed universe IDs:", error);
    return new Set();
  }
  return new Set(data.map((s) => s.universe.id));
}
