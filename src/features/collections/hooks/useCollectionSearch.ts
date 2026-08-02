// src/features/collections/hooks/useCollectionSearch.ts
import { createSignal, createMemo, type Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

/**
 * useCollectionSearch — search the user's watchlist (vault) for
 * titles to add to a collection.
 *
 * Why a separate hook?
 *   The collection detail page filter (useCollectionFilter) searches
 *   WITHIN the current collection's entries. This hook searches the
 *   ENTIRE vault so the AddTitlesModal / ReorderModal can show the
 *   user titles they own but haven't yet added to this folder.
 *
 * Search semantics mirror VaultSearch exactly (title, cast, director,
 * genre, year) so users get the same matches they'd see in the main
 * watchlist search.
 *
 * The hook returns:
 *   - query          — current search string (signal)
 *   - setQuery       — setter (bind to an <input>)
 *   - debouncedQuery — debounced + lowercased query (used by results)
 *   - results        — memo over the vault filtered by the debounced
 *                      query, capped at `limit` (default 50). Each
 *                      result also exposes whether it's already in
 *                      the target collection so the modal can render
 *                      "Added" vs "Add".
 *   - reset          — clears the query
 */
export interface UseCollectionSearchOptions {
  /** The vault (watchlist) accessor to search within. */
  vault: Accessor<WatchlistItem[]>;
  /**
   * Set of `${media_type}:${id}` keys already in the target
   * collection. Used to flag search results as already-added so the
   * UI can render "Added" instead of "Add".
   */
  existingKeys?: Accessor<Set<string>>;
  /** Max results to return. Default 50. */
  limit?: number;
  /** Debounce ms. Default 200. */
  debounceMs?: number;
}

export interface CollectionSearchResult {
  item: WatchlistItem;
  /** `${media_type}:${id}` — the key the parent uses to dedupe. */
  key: string;
  /** True when this vault item is already in the target collection. */
  alreadyInCollection: boolean;
}

export function useCollectionSearch(options: UseCollectionSearchOptions) {
  const limit = options.limit ?? 50;
  const debounceMs = options.debounceMs ?? 200;

  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");

  let timer: ReturnType<typeof setTimeout> | null = null;
  const onInput = (v: string) => {
    setQuery(v);
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => setDebouncedQuery(v.trim().toLowerCase()),
      debounceMs
    );
  };

  const reset = () => {
    setQuery("");
    setDebouncedQuery("");
    if (timer) clearTimeout(timer);
  };

  // Per-item lowercased search string. Cached in a WeakMap so repeat
  // searches on the same item are O(1) — mirrors vaultFilterUtils.
  const index = new WeakMap<WatchlistItem, string>();
  const searchText = (m: WatchlistItem): string => {
    const cached = index.get(m);
    if (cached !== undefined) return cached;
    const year = (m.release_date || m.first_air_date || "").substring(0, 4);
    let castStr = "";
    if (m.castList) for (const c of m.castList) castStr += " " + c;
    if (m.credits?.cast) {
      for (const c of m.credits.cast) if (c?.name) castStr += " " + c.name;
    }
    if (m.credits?.crew) {
      for (const crew of m.credits.crew) {
        if (crew?.job === "Director" && crew.name) castStr += " " + crew.name;
      }
    }
    let genresStr = "";
    if (m.genresList) {
      for (const g of m.genresList) {
        if (typeof g === "string") genresStr += " " + g;
      }
    }
    const text = (
      (m.title || "") +
      " " +
      (m.original_title || "") +
      " " +
      (m.name || "") +
      " " +
      (m.original_name || "") +
      " " +
      (m.director || "") +
      " " +
      year +
      " " +
      castStr +
      " " +
      genresStr
    ).toLowerCase();
    index.set(m, text);
    return text;
  };

  const results = createMemo<CollectionSearchResult[]>(() => {
    const q = debouncedQuery();
    const v = options.vault();
    const existing = options.existingKeys?.() ?? new Set<string>();
    if (!q) {
      // No query — return the first `limit` vault items, in vault
      // order (most-recently-added first when the vault signal is
      // sorted that way upstream). Cap to keep the modal snappy.
      const out: CollectionSearchResult[] = [];
      for (const item of v) {
        const key = `${item.media_type}:${item.id}`;
        out.push({ item, key, alreadyInCollection: existing.has(key) });
        if (out.length >= limit) break;
      }
      return out;
    }
    const out: CollectionSearchResult[] = [];
    for (const item of v) {
      if (searchText(item).includes(q)) {
        const key = `${item.media_type}:${item.id}`;
        out.push({ item, key, alreadyInCollection: existing.has(key) });
        if (out.length >= limit) break;
      }
    }
    return out;
  });

  return {
    query,
    setQuery: onInput,
    debouncedQuery,
    results,
    reset
  };
}
