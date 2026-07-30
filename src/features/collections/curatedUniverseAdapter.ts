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
  CuratedUniverseEntryRow
} from "~/lib/supabase/repositories";
import type {
  TMDBTitle,
  Collection,
  CollectionEntry,
  UniversePhase,
  ViewingOrder,
  ViewingOrderOption
} from "~/shared/types";

// ---------------------------------------------------------------------------
// Constants — the 3 unified viewing orders shown in BOTH admin + consumer UI
// ---------------------------------------------------------------------------

/**
 * The three unified viewing orders. Used by:
 *   - curatedUniverseRowToCollection (sets Collection.viewingOrders)
 *   - AdminCollectionEditorPage SORT_MODES (kept in sync via sortModesEqual)
 *
 * IMPORTANT: the labels here are the SINGLE source of truth — the same
 * label is shown in the admin sort-mode switcher AND the consumer order
 * switcher. No more "chronological" in one place and "timeline" in
 * another for the same concept.
 */
export const UNIVERSE_VIEWING_ORDERS: ViewingOrderOption[] = [
  {
    id: "story",
    label: "Storyline",
    description: "In-universe story chronology"
  },
  {
    id: "release",
    label: "Release Year",
    description: "Theatrical release date order"
  },
  {
    id: "franchise",
    label: "Franchise",
    description: "Grouped by movie series (Iron Man, Thor, etc.)"
  }
];

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
  entries: CollectionEntry[] = []
): Collection {
  // Map the DB's default_view enum to our 3 unified ViewingOrder values.
  //   DB "timeline" → "story"   (in-universe chronology)
  //   DB "release"  → "release"
  //   DB "story"    → "story"
  // Legacy DB values are mapped to "story" for safety.
  const defaultViewMap: Record<string, ViewingOrder> = {
    timeline: "story",
    story: "story",
    release: "release",
    franchise: "franchise"
  };
  const defaultOrder: ViewingOrder =
    defaultViewMap[row.default_view] ?? "story";

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
    // The 3 unified orders — same labels in admin and consumer.
    viewingOrders: UNIVERSE_VIEWING_ORDERS,
    defaultOrder,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
  tmdb?: TMDBTitle | null
): CollectionEntry {
  const title = tmdb?.title ?? tmdb?.name;
  return {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    title,
    name: tmdb?.name,
    poster_path: tmdb?.poster_path ?? undefined,
    backdrop_path: tmdb?.backdrop_path ?? undefined,
    release_date: tmdb?.release_date,
    first_air_date: tmdb?.first_air_date,
    // Sort indices from the DB:
    order: row.position,
    storyOrder: row.story_position,
    releaseOrder: row.release_position,
    // In-universe "year of incident" set by the admin (e.g. 1943 for
    // Captain America: The First Avenger). Drives the Storyline sort.
    // NULL means unknown — the consumer falls back to storyOrder.
    incidentYear: row.incident_year ?? undefined,
    // Franchise group derived from the title (e.g. "Captain America: The
    // First Avenger" → "Captain America"). Used by the "Franchise" view
    // to group all films in the same series together. Standalone titles
    // (no colon) fall into "Standalone & Other".
    franchise: deriveFranchise(title),
    userNote: row.note ?? undefined
  };
}

/**
 * Derive a franchise / movie-series label from a title.
 *
 * Strategy: take everything before the first colon, trimmed. This works
 * for the vast majority of franchise films:
 *   "Iron Man"             → "Iron Man"          (no colon — standalone)
 *   "Iron Man 2"           → "Iron Man 2"        (no colon — but matches
 *                                                  because we strip trailing
 *                                                  digits too)
 *   "Captain America: The First Avenger" → "Captain America"
 *   "Thor: The Dark World" → "Thor"
 *   "Avengers: Endgame"    → "Avengers"
 *   "The Avengers"         → "The Avengers"      (no colon — standalone)
 *
 * For titles without a colon but ending in a number (e.g. "Iron Man 2",
 * "Iron Man 3") we strip the trailing number so all Iron Man films group
 * together.
 *
 * Empty titles return undefined → the caller puts them in "Standalone & Other".
 */
function deriveFranchise(title: string | undefined | null): string | undefined {
  if (!title) return undefined;
  const trimmed = title.trim();
  if (!trimmed) return undefined;

  // 1. If there's a colon, take everything before it.
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    return trimmed.slice(0, colonIdx).trim();
  }

  // 2. Otherwise, strip a trailing " <number>" / " <roman numeral>" so
  //    "Iron Man 2", "Iron Man 3" → "Iron Man".
  const trailingNum = trimmed.replace(/\s+(?:\d+|[IVXLCDM]+)$/i, "");
  if (trailingNum && trailingNum !== trimmed) {
    return trailingNum.trim();
  }

  // 3. No colon, no trailing number → standalone film ("The Incredible
  //    Hulk", "Black Widow", etc.). Return the title itself; it will be
  //    its own group.
  return trimmed;
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
    console.error(
      "[curatedUniverseAdapter] Error fetching all curated universes:",
      error
    );
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
  slugOrId: string
): Promise<Collection | null> {
  const repo = getDiscoverRepository();

  // 1. Fetch the universe row — try slug first, fall back to id.
  let universe: CuratedUniverseRow | null = null;

  const { data: bySlug, error: slugError } =
    await repo.getCuratedUniverseBySlug(slugOrId);
  if (slugError) {
    // Log but don't bail — we still want to try the id lookup.
    console.error(
      "[curatedUniverseAdapter] Error fetching universe by slug:",
      slugError
    );
  }
  if (bySlug) {
    universe = bySlug;
  } else {
    // No slug match (or slug lookup errored) — try primary-key lookup.
    const { data: byId, error: idError } =
      await repo.getCuratedUniverseById(slugOrId);
    if (idError) {
      console.error(
        "[curatedUniverseAdapter] Error fetching universe by id:",
        idError
      );
    }
    universe = byId;
  }

  if (!universe) return null;

  // 2. Fetch the universe's entries.
  const { data: entryRows, error: entriesError } =
    await repo.getCuratedUniverseEntries(universe.id);
  if (entriesError) {
    console.error(
      "[curatedUniverseAdapter] Error fetching universe entries:",
      entriesError
    );
    return curatedUniverseRowToCollection(universe, []);
  }

  // 3. Batch-fetch TMDB metadata for each entry (title, poster, etc.).
  const tmdbItems = entryRows.map((e) => ({
    mediaType: e.media_type,
    tmdbId: e.tmdb_id
  }));
  const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
  const tmdbMap =
    tmdbItems.length > 0
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
export async function fetchSubscribedUniverses(
  userId: string
): Promise<Collection[]> {
  const repo = getDiscoverRepository();
  const { data: subscriptions, error } =
    await repo.getSubscribedUniverses(userId);
  if (error) {
    console.error(
      "[curatedUniverseAdapter] Error fetching subscribed universes:",
      error
    );
    return [];
  }

  // Fetch entries for each subscribed universe in parallel.
  const collections = await Promise.all(
    subscriptions.map(async ({ universe }) => {
      const { data: entryRows, error: entriesError } =
        await repo.getCuratedUniverseEntries(universe.id);
      if (entriesError) {
        console.error(
          "[curatedUniverseAdapter] Error fetching entries for universe:",
          universe.id,
          entriesError
        );
        return curatedUniverseRowToCollection(universe, []);
      }

      // Batch-fetch TMDB metadata for entries.
      const tmdbItems = entryRows.map((e) => ({
        mediaType: e.media_type,
        tmdbId: e.tmdb_id
      }));
      const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
      const tmdbMap =
        tmdbItems.length > 0
          ? await fetchTmdbMetadataBatch(tmdbItems)
          : new Map<string, TMDBTitle>();

      const entries = entryRows.map((row) => {
        const tmdbKey = `${row.media_type}/${row.tmdb_id}`;
        const tmdb = tmdbMap.get(tmdbKey) ?? null;
        return curatedEntryRowToCollectionEntry(row, tmdb);
      });

      return curatedUniverseRowToCollection(universe, entries);
    })
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
export async function fetchSubscribedUniverseIds(
  userId: string
): Promise<Set<string>> {
  const repo = getDiscoverRepository();
  const { data, error } = await repo.getSubscribedUniverses(userId);
  if (error) {
    console.error(
      "[curatedUniverseAdapter] Error fetching subscribed universe IDs:",
      error
    );
    return new Set();
  }
  return new Set(data.map((s) => s.universe.id));
}

// ---------------------------------------------------------------------------
// Phase dividers — admin-authored section headers for curated universes.
// Stored in the `universe_phases` table. The user-side detail page
// renders them as section headers BEFORE the entry identified by
// `beforeEntryId`. Users have NO edit access — these come entirely
// from the admin panel.
// ---------------------------------------------------------------------------

/**
 * Fetch all phase dividers for a curated universe, ordered by
 * `order_index` ascending. Returns an empty array on error or when
 * no phases have been configured.
 *
 * Each phase has a `beforeEntryId` pointing at a
 * `curated_universe_entries.id` (NOT the TMDB id). The consumer
 * detail page walks the sorted entries; whenever it encounters the
 * entry whose row id matches `beforeEntryId`, it renders the phase
 * header first, then the entry.
 */
export async function fetchPhasesForUniverse(
  universeId: string
): Promise<UniversePhase[]> {
  try {
    const { getClient } = await import("~/lib/supabase/client");
    const supabase = getClient();
    const { data, error } = await supabase
      .from("universe_phases")
      .select(
        "id, universe_id, label, description, before_entry_id, order_index, created_at, updated_at"
      )
      .eq("universe_id", universeId)
      .order("order_index", { ascending: true });
    if (error) {
      console.error(
        "[curatedUniverseAdapter] Error fetching universe_phases:",
        error
      );
      return [];
    }
    if (!data || data.length === 0) return [];
    return (
      data as Array<{
        id: string;
        universe_id: string;
        label: string;
        description: string | null;
        before_entry_id: string | null;
        order_index: number;
        created_at: string;
        updated_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      universeId: row.universe_id,
      label: row.label,
      description: row.description,
      beforeEntryId: row.before_entry_id,
      orderIndex: row.order_index,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) {
    console.error(
      "[curatedUniverseAdapter] Failed to fetch universe_phases:",
      err
    );
    return [];
  }
}

/**
 * Attach fetched phase dividers to an existing Collection object.
 * Used by the detail page after it resolves the universe — phases
 * are fetched as a separate query and merged in.
 */
export function withPhases(
  collection: Collection,
  phases: UniversePhase[]
): Collection {
  return { ...collection, phases };
}
