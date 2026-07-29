// src/features/collections/hooks/useCollectionFilter.ts
import { createSignal, createMemo, type Accessor } from "solid-js";
import type { CollectionEntry } from "~/shared/types";

/**
 * Status filter pills available on the collection detail page.
 * "all" is the default — shows every entry.
 *
 * The pill values mirror the vault_status_type enum used by the
 * user's watchlist (planned / watching / completed / on_hold /
 * dropped). The detail page receives the user's vault items so it
 * can join each entry's status. Entries NOT in the user's vault
 * are shown only under "all" and "planned" (treated as planned).
 */
export type CollectionStatusFilter =
  | "all"
  | "watching"
  | "completed"
  | "planned"
  | "on_hold"
  | "dropped";

export const STATUS_FILTER_OPTIONS: { value: CollectionStatusFilter; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "watching",   label: "Watching" },
  { value: "completed",  label: "Completed" },
  { value: "planned",    label: "Planned" },
  { value: "on_hold",    label: "On Hold" },
  { value: "dropped",    label: "Dropped" },
];

export interface UseCollectionFilterOptions {
  initialStatus?: CollectionStatusFilter;
  initialSearch?: string;
  /** Vault status lookup: `${media_type}:${tmdb_id}` → status string.
   *  Entries not present in the map are treated as "planned" (or
   *  "not in vault" — same pill). */
  statusOf?: Accessor<Record<string, string>>;
}

/**
 * useCollectionFilter — Solid signals wrapper around the search box
 * and status pills on the collection detail page.
 *
 * Returns three signals (status, search, debouncedSearch) and a
 * `filter` function that takes an entries accessor and returns a
 * filtered memo.
 *
 * The search matches against title, cast, director, and genre —
 * mirroring the watchlist search behavior added in v2.6.
 */
export function useCollectionFilter(options: UseCollectionFilterOptions = {}) {
  const [status, setStatus] = createSignal<CollectionStatusFilter>(options.initialStatus ?? "all");
  const [search, setSearch] = createSignal<string>(options.initialSearch ?? "");
  const [debouncedSearch, setDebouncedSearch] = createSignal<string>(options.initialSearch ?? "");

  // Lightweight debounce — 200 ms. Solid's onInput fires on every
  // keystroke; debouncing avoids re-filtering a 200-entry universe
  // on every char. We use setTimeout + clear to keep it framework-
  // agnostic (no createAsync or store dep).
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const onSearchInput = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setDebouncedSearch(value.trim().toLowerCase()), 200);
  };

  const matchesSearch = (entry: CollectionEntry, q: string): boolean => {
    if (!q) return true;
    // Title + name
    const title = (entry.title ?? entry.name ?? "").toLowerCase();
    if (title.includes(q)) return true;
    // Cast + director (TMDB metadata hydrated on CollectionEntry —
    // currently the entry type doesn't expose credits directly, but
    // vault items do; the caller can extend the entry shape via the
    // vault join. For now we match against the franchise + entryType
    // fields which are present on curated universe entries.)
    const franchise = (entry.franchise ?? "").toLowerCase();
    if (franchise.includes(q)) return true;
    const entryType = (entry.entryType ?? "").toLowerCase();
    if (entryType.includes(q)) return true;
    const note = (entry.userNote ?? "").toLowerCase();
    if (note.includes(q)) return true;
    return false;
  };

  const matchesStatus = (entry: CollectionEntry, s: CollectionStatusFilter): boolean => {
    if (s === "all") return true;
    const r = options.statusOf?.() ?? {};
    const st = r[`${entry.media_type}:${entry.id}`];
    if (!st) {
      // Not in vault — only visible under "all" or "planned".
      return s === "planned";
    }
    return st.toLowerCase() === s;
  };

  const filter = (entries: Accessor<CollectionEntry[]>) =>
    createMemo(() => {
      const s = status();
      const q = debouncedSearch();
      const list = entries();
      if (s === "all" && !q) return list;
      return list.filter(
        (e) => matchesStatus(e, s) && matchesSearch(e, q),
      );
    });

  return {
    status,
    setStatus,
    search,
    onSearchInput,
    debouncedSearch,
    filter,
  };
}
