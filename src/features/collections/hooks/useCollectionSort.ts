// src/features/collections/hooks/useCollectionSort.ts
import { createSignal, createMemo, type Accessor } from "solid-js";
import type { CollectionEntry, ViewingOrder } from "~/shared/types";

/**
 * Sort modes available on a USER collection's detail page.
 *
 *   - "manual"      → user's manual drag-to-reorder (uses entry.order)
 *   - "release"     → by theatrical release date
 *   - "added"       → by date added to the collection (entry.order ascending)
 *   - "title"       → alphabetical (case-insensitive)
 *   - "rating"      → by user's star rating (desc; unrated last)
 *
 * Universes (curated collections) use the dedicated ViewingOrder union
 * (story/release/franchise) and are NOT sorted via this hook — their
 * sort is locked to "Timeline Order" managed by the admin.
 */
export type UserCollectionSortMode = "manual" | "release" | "added" | "title" | "rating";

export const USER_SORT_OPTIONS: { value: UserCollectionSortMode; label: string }[] = [
  { value: "manual",  label: "Manual Order" },
  { value: "release", label: "Release Date" },
  { value: "added",   label: "Date Added" },
  { value: "title",   label: "Title" },
  { value: "rating",  label: "Rating" },
];

export interface UseCollectionSortOptions {
  initial?: UserCollectionSortMode;
  /** User ratings keyed by `${media_type}:${tmdb_id}` → 0..10 number.
   *  Used by the "rating" sort mode. Optional. */
  ratings?: Accessor<Record<string, number>>;
}

/**
 * useCollectionSort — Solid signals wrapper around the user-collection
 * sort mode. Exposes the current mode, a setter, and a memo that
 * produces a sorted COPY of the provided entries array.
 *
 * Pure: the input accessor is never mutated. The memo recomputes
 * only when the input or the mode changes.
 */
export function useCollectionSort(options: UseCollectionSortOptions = {}) {
  const [mode, setMode] = createSignal<UserCollectionSortMode>(options.initial ?? "manual");

  const sortEntries = (entries: CollectionEntry[]): CollectionEntry[] => {
    const m = mode();
    const copy = entries.slice();
    switch (m) {
      case "manual":
        // Preserve the existing order (entry.order from the DB). The
        // drag-to-reorder handler mutates the source array via
        // useCollections.reorderEntries; this sort is a no-op so the
        // dragged order stays intact.
        return copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      case "release": {
        const dateOf = (e: CollectionEntry): number => {
          const s = e.release_date ?? e.first_air_date;
          if (!s) return Number.MAX_SAFE_INTEGER;
          const t = Date.parse(s);
          return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
        };
        return copy.sort((a, b) => dateOf(a) - dateOf(b));
      }
      case "added":
        // entry.order is the 1-based insertion position. Lower = added earlier.
        return copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      case "title": {
        const titleOf = (e: CollectionEntry): string =>
          (e.title ?? e.name ?? "").toLowerCase().replace(/^the\s+/, "");
        return copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
      }
      case "rating": {
        const r = options.ratings?.() ?? {};
        const ratingOf = (e: CollectionEntry): number => r[`${e.media_type}:${e.id}`] ?? -1;
        return copy.sort((a, b) => ratingOf(b) - ratingOf(a));
      }
      default:
        return copy;
    }
  };

  return {
    mode,
    setMode,
    /** Wrap an entries accessor to get a sorted version. */
    sort: (entries: Accessor<CollectionEntry[]>) =>
      createMemo(() => sortEntries(entries())),
    /** Direct sort (imperative; useful for one-offs). */
    sortNow: (entries: CollectionEntry[]) => sortEntries(entries),
  };
}

/**
 * Resolve the right sort mode for a collection given its type.
 *
 * - Curated universes → always "story" (Timeline Order). The user
 *   has no sort controls.
 * - User collections → the user's chosen mode (default "manual").
 *
 * Returns the ViewingOrder (for universes) or UserCollectionSortMode
 * (for user collections) — callers can branch on the union type.
 */
export function resolveInitialSort(isUniverse: boolean): UserCollectionSortMode | ViewingOrder {
  return isUniverse ? "story" : "manual";
}
