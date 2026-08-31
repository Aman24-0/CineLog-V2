import type { VaultFilters } from "~/shared/types";
import { normalizeVaultFilters } from "./vaultFilterUtils";

const STORAGE_KEY = "cinelog.library-view.v1";
const MAX_DISPLAY_LIMIT = 2000;

export interface LibraryViewState {
  searchInput: string;
  filters: VaultFilters;
  activeStatusTab: string;
  viewMode: "grid" | "timeline";
  displayLimit: number;
  expandedShelves: string[];
  filterCollapsed: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isViewMode = (value: unknown): value is "grid" | "timeline" =>
  value === "grid" || value === "timeline";

/**
 * Validate that a parsed object has the required VaultFilters shape.
 *
 * Part 3 migration: the old shape required `region: string`; the new
 * shape requires `language: string`. We accept EITHER here so that
 * old persisted state (which may carry `region: "Indian"`) doesn't
 * fail validation and fall back to defaults. The actual migration
 * (dropping `region` and defaulting `language` to "all") is performed
 * by `normalizeVaultFilters` in vaultFilterUtils.ts, which is called
 * by `useVaultFiltering` via `presetAdapter.normalizeVaultFilters`.
 *
 * This validator is intentionally loose: it accepts both the old and
 * the new shape (with `region` OR `language`), and any string value
 * for either. The downstream `normalizeVaultFilters` is responsible
 * for whitelisting actual values and discarding the obsolete
 * `region` field.
 */
const isFilters = (value: unknown): value is VaultFilters => {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    typeof value.status === "string" &&
    // Part 3: accept either `language` (new) OR `region` (legacy).
    // The downstream normalizer will produce the canonical `language`
    // field and drop `region`.
    (typeof value.language === "string" || typeof value.region === "string") &&
    typeof value.genre === "string" &&
    typeof value.platform === "string" &&
    typeof value.sortField === "string" &&
    typeof value.sortDirection === "string" &&
    typeof value.tag === "string" &&
    typeof value.imdbMin === "string" &&
    typeof value.imdbMax === "string" &&
    typeof value.rtMin === "string" &&
    typeof value.rtMax === "string" &&
    typeof value.yearMin === "string" &&
    typeof value.yearMax === "string" &&
    typeof value.runtimeMin === "string" &&
    typeof value.runtimeMax === "string"
  );
};

function emptyState(): LibraryViewState {
  return {
    searchInput: "",
    filters: {
      type: "all",
      status: "all",
      language: "all",
      genre: "all",
      platform: "all",
      sortField: "added_date",
      sortDirection: "desc",
      tag: "all",
      imdbMin: "",
      imdbMax: "",
      rtMin: "",
      rtMax: "",
      yearMin: "",
      yearMax: "",
      runtimeMin: "",
      runtimeMax: ""
    },
    activeStatusTab: "all",
    viewMode: "grid",
    displayLimit: 20,
    expandedShelves: [],
    filterCollapsed: false
  };
}

export function readLibraryViewState(): LibraryViewState {
  const fallback = emptyState();
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return fallback;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallback;

    // Part 3 — if `parsed.filters` carries the legacy `region` field,
    // we still pass it through `isFilters` (which accepts either), and
    // the downstream `normalizeVaultFilters` (called by
    // `useVaultFiltering.presetAdapter.normalizeVaultFilters`) is
    // responsible for dropping `region` and defaulting `language` to
    // "all". Here we just ensure the shape is structurally valid; we
    // do NOT mutate `parsed.filters` (the consumer will normalize).

    return {
      searchInput: typeof parsed.searchInput === "string" ? parsed.searchInput : fallback.searchInput,
      // Part 3 — `normalizeVaultFilters` accepts either `region`
      // (legacy) or `language` (new), drops `region` if present,
      // and defaults `language` to "all". This means old persisted
      // state (which carries `region: "Indian"`) is safely migrated
      // to `{ language: "all" }` on first read — no crash, no fake
      // language filter. The normalized shape is then written back
      // on the next `writeLibraryViewState` call.
      filters: isFilters(parsed.filters)
        ? normalizeVaultFilters(parsed.filters)
        : fallback.filters,
      activeStatusTab: typeof parsed.activeStatusTab === "string" ? parsed.activeStatusTab : fallback.activeStatusTab,
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : fallback.viewMode,
      displayLimit:
        typeof parsed.displayLimit === "number" &&
        Number.isFinite(parsed.displayLimit) &&
        parsed.displayLimit >= 20
          ? Math.min(Math.floor(parsed.displayLimit), MAX_DISPLAY_LIMIT)
          : fallback.displayLimit,
      expandedShelves: Array.isArray(parsed.expandedShelves)
        ? parsed.expandedShelves.filter((value): value is string => typeof value === "string").slice(0, 24)
        : fallback.expandedShelves,
      filterCollapsed: parsed.filterCollapsed === true
    };
  } catch {
    return fallback;
  }
}

export function writeLibraryViewState(state: LibraryViewState): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        searchInput: state.searchInput.slice(0, 200),
        expandedShelves: state.expandedShelves.slice(0, 24),
        displayLimit: Math.min(Math.max(Math.floor(state.displayLimit), 20), MAX_DISPLAY_LIMIT)
      })
    );
  } catch {
    // View-state persistence is best-effort and must never block the Library.
  }
}

export function clearLibraryViewState(): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}
