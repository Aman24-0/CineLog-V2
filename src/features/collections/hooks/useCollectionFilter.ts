// src/features/collections/hooks/useCollectionFilter.ts
import { createSignal, createMemo, type Accessor } from "solid-js";
import type { CollectionEntry, WatchlistItem } from "~/shared/types";

/**
 * Status filter pills available on the collection detail page.
 *
 * v4 — slimmed down to the four statuses that actually exist in the
 * user's vault (the watchlist has no "On Hold" or "Dropped" — those
 * were leftovers from an old enum that never matched real data).
 *
 * Pill semantics:
 *   - "all"        → every entry passes
 *   - "watching"   → entry is in vault with status === "Watching"
 *   - "completed"  → entry is in vault with status === "Completed"
 *   - "planned"    → entry is in vault with status === "Planned"
 *                    (also covers legacy "Plan to Watch")
 *
 * Entries NOT in the user's vault ("Unwatched") are ONLY visible
 * under "all". They don't show under "planned" because the user
 * hasn't actually planned them — they're just titles in a curated
 * universe the user hasn't added to their vault yet.
 */
export type CollectionStatusFilter =
  "all" | "watching" | "completed" | "planned";

export const STATUS_FILTER_OPTIONS: {
  value: CollectionStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "planned", label: "Planned" }
];

export interface UseCollectionFilterOptions {
  initialStatus?: CollectionStatusFilter;
  initialSearch?: string;
  /**
   * Vault (watchlist) accessor. Used to resolve each entry's status
   * via the { id, media_type } → WatchlistItem lookup. Entries not
   * found in the vault are treated as "Unwatched".
   */
  vault?: Accessor<WatchlistItem[]>;
}

/**
 * useCollectionFilter — Solid signals wrapper around the search box
 * and status pills on the collection detail page.
 *
 * Returns the signals + a `filter` function that takes an entries
 * accessor and returns a filtered memo.
 *
 * The search box matches against title, cast, director, and genre —
 * mirroring the watchlist (Vault) search behavior. The vault is the
 * source of truth for cast/director/genre because CollectionEntry
 * itself only carries title + poster + dates (TMDB metadata is
 * hydrated lazily and not stored on the entry). When an entry has no
 * matching vault row, only the title is searched.
 */
export function useCollectionFilter(options: UseCollectionFilterOptions = {}) {
  const [status, setStatus] = createSignal<CollectionStatusFilter>(
    options.initialStatus ?? "all"
  );
  const [search, setSearch] = createSignal<string>(options.initialSearch ?? "");
  const [debouncedSearch, setDebouncedSearch] = createSignal<string>(
    options.initialSearch ?? ""
  );

  // 200ms debounce — same as the watchlist search. Solid's onInput
  // fires per keystroke; debouncing avoids re-filtering a 200-entry
  // universe on every char.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const onSearchInput = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => setDebouncedSearch(value.trim().toLowerCase()),
      200
    );
  };

  // ── Status lookup ─────────────────────────────────────────────
  // Build a Map<`${media_type}:${id}`, WatchlistItem> from the vault
  // for O(1) status checks. Returns null entries when the vault is
  // not provided.
  const vaultMap = createMemo<Map<string, WatchlistItem>>(() => {
    const map = new Map<string, WatchlistItem>();
    const v = options.vault?.() ?? [];
    for (const item of v) {
      map.set(`${item.media_type}:${item.id}`, item);
    }
    return map;
  });

  /** Resolve the lowercase vault status string for an entry, or null
   *  when the entry isn't in the vault. */
  const statusOf = (entry: CollectionEntry): string | null => {
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    if (!v) return null;
    return (v.status ?? "").toLowerCase();
  };

  const matchesStatus = (
    entry: CollectionEntry,
    s: CollectionStatusFilter
  ): boolean => {
    if (s === "all") return true;
    const st = statusOf(entry);
    if (st == null) {
      // Unwatched — only visible under "all".
      return false;
    }
    if (s === "planned") {
      // Covers both "planned" and the legacy "plan to watch" string.
      return st === "planned" || st === "plan to watch";
    }
    return st === s;
  };

  // ── Search ────────────────────────────────────────────────────
  // Search matches title/name on the entry itself, plus cast,
  // director, and genre from the joined vault item (the vault holds
  // the rich TMDB metadata; CollectionEntry is intentionally thin).
  const matchesSearch = (entry: CollectionEntry, q: string): boolean => {
    if (!q) return true;
    // Title + name (entry-level)
    const title = (entry.title ?? entry.name ?? "").toLowerCase();
    if (title.includes(q)) return true;
    // Franchise + entryType (entry-level)
    if ((entry.franchise ?? "").toLowerCase().includes(q)) return true;
    if ((entry.entryType ?? "").toLowerCase().includes(q)) return true;

    // Cast / director / genre from the joined vault item
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    if (v) {
      // Director
      if ((v.director ?? "").toLowerCase().includes(q)) return true;
      // Cast list (top 15 names)
      if (v.castList) {
        for (const c of v.castList) {
          if (c.toLowerCase().includes(q)) return true;
        }
      }
      // Full credits payload (rare — only items opened in Details modal)
      if (v.credits) {
        if (Array.isArray(v.credits.cast)) {
          for (const c of v.credits.cast) {
            if (c?.name && c.name.toLowerCase().includes(q)) return true;
          }
        }
        if (Array.isArray(v.credits.crew)) {
          for (const m of v.credits.crew) {
            if (
              m?.job === "Director" &&
              m.name &&
              m.name.toLowerCase().includes(q)
            )
              return true;
          }
        }
      }
      // Genres
      if (v.genresList) {
        for (const g of v.genresList) {
          if (typeof g === "string" && g.toLowerCase().includes(q)) return true;
        }
      }
    }
    return false;
  };

  const filter = (entries: Accessor<CollectionEntry[]>) => {
    const filtered = createMemo(() => {
      const s = status();
      const q = debouncedSearch();
      const list = entries();
      if (s === "all" && !q) return list;
      return list.filter((e) => matchesStatus(e, s) && matchesSearch(e, q));
    });
    return filtered;
  };

  return {
    status,
    setStatus,
    search,
    onSearchInput,
    debouncedSearch,
    filter,
    /** Expose the vault map so callers can resolve per-entry status
     *  for the redesigned EntryListRow (status badge + rating). */
    vaultMap
  };
}
