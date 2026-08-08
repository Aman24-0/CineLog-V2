// src/features/admin/collectionEditor/sortUtils.ts
//
// Sort + group + franchise-derivation helpers for the Admin Collection
// Editor Page.
//
// Extracted from AdminCollectionEditorPage.tsx (Phase 8 Chunk 3) so the
// sort logic can be unit-tested in isolation and reused by other admin
// pages if needed.
//
// IMPORTANT: `deriveFranchise()` MIRRORS the implementation in
// `curatedUniverseAdapter.ts` so the admin "Franchise" sort groups
// entries identically to how the consumer will see them. Keep the two
// implementations in sync — if you change one, change the other.

import type { AdminEntry, SortMode } from "./types";

/**
 * The 3 unified sort modes — same labels as the consumer side
 * (see UNIVERSE_VIEWING_ORDERS in curatedUniverseAdapter.ts).
 *
 *   - "story"     → Storyline    (sort by incident_year)
 *   - "release"   → Release Year (sort by TMDB release_date)
 *   - "franchise" → Franchise    (group by title-derived franchise,
 *                                 then sort within each group by
 *                                 incident_year)
 */
export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "story", label: "Storyline" },
  { id: "release", label: "Release Year" },
  { id: "franchise", label: "Franchise" }
];

/**
 * Derive the franchise label for a title.
 *
 * Mirrors `deriveFranchise()` in curatedUniverseAdapter.ts so the
 * admin "Franchise" sort groups entries identically to how the
 * consumer will see them. IMPORTANT: keep the two implementations in
 * sync — if you change one, change the other.
 */
export function deriveFranchise(title: string | null | undefined): string {
  if (!title) return "Standalone & Other";
  const trimmed = title.trim();
  if (!trimmed) return "Standalone & Other";
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) return trimmed.slice(0, colonIdx).trim();
  const trailingNum = trimmed.replace(/\s+(?:\d+|[IVXLCDM]+)$/i, "");
  if (trailingNum && trailingNum !== trimmed) return trailingNum.trim();
  return trimmed;
}

/**
 * Sort entries by the active sort mode.
 *
 *   - story     → by incident_year (nulls last), position fallback
 *   - release   → by TMDB release_date (string compare), position fallback
 *   - franchise → by franchise label, then incident_year, then position
 *
 * Pure function — does NOT mutate the input array.
 */
export function sortEntries(
  entries: AdminEntry[],
  mode: SortMode
): AdminEntry[] {
  return [...entries].sort((a, b) => {
    if (mode === "release") {
      // Release sort: by TMDB release_date (string compare).
      const da = a.release_date ?? "";
      const db = b.release_date ?? "";
      if (da && db && da !== db) return da.localeCompare(db);
      // Tiebreaker: admin's primary position.
      return (a.position ?? 0) - (b.position ?? 0);
    }
    if (mode === "franchise") {
      // Franchise mode: primary sort by franchise label, then by
      // incident_year within each group (position fallback).
      const fa = deriveFranchise(a.title);
      const fb = deriveFranchise(b.title);
      if (fa !== fb) return fa.localeCompare(fb);
      const ia = a.incident_year;
      const ib = b.incident_year;
      if (ia !== null && ib !== null && ia !== ib) return ia - ib;
      if (ia !== null && ib === null) return -1;
      if (ia === null && ib !== null) return 1;
      return (a.position ?? 0) - (b.position ?? 0);
    }
    // mode === "story" — Storyline sort by incident_year.
    const ia = a.incident_year;
    const ib = b.incident_year;
    if (ia !== null && ib !== null && ia !== ib) return ia - ib;
    if (ia !== null && ib === null) return -1;
    if (ia === null && ib !== null) return 1;
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

/**
 * Group sorted entries by franchise (only meaningful in franchise mode).
 *
 * Returns null when `mode !== "franchise"` so the renderer can decide
 * whether to draw group headers or a flat list.
 */
export function groupByFranchise(
  entries: AdminEntry[],
  mode: SortMode
): { franchise: string; entries: AdminEntry[] }[] | null {
  if (mode !== "franchise") return null;
  const groups: { franchise: string; entries: AdminEntry[] }[] = [];
  let current: { franchise: string; entries: AdminEntry[] } | null = null;
  for (const entry of entries) {
    const f = deriveFranchise(entry.title);
    if (!current || current.franchise !== f) {
      current = { franchise: f, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

/**
 * Compute the left-badge string for an entry given the active sort.
 *   - storyline → incident_year (or "—" if unset)
 *   - release   → release year (or "—")
 *   - franchise → 1-based index within the franchise group
 */
export function leftBadgeFor(
  entry: AdminEntry,
  mode: SortMode,
  groupIndex: number | null
): string {
  if (mode === "story") {
    return entry.incident_year !== null ? String(entry.incident_year) : "—";
  }
  if (mode === "release") {
    const y = entry.release_date?.match(/^(\d{4})/)?.[1];
    return y ?? "—";
  }
  // franchise
  return groupIndex !== null ? String(groupIndex + 1) : "—";
}

/**
 * Test whether a string is a UUID (used by resolveUniverse to decide
 * whether to try the cheap single-fetch path or the slug-list path).
 */
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s
  );
}
