// src/features/watchlist/tagStore.ts
/**
 * tagStore — Phase 6.2 Task 1a
 *
 * Manages the user's TAG VOCABULARY (the list of tag names they've
 * defined) in localStorage. This is separate from the tags IN USE on
 * vault items (which are derived from the watchlist via the
 * `uniqueTags` memo in useVaultFiltering).
 *
 * The vocabulary exists so a user can pre-define tags like "Weekend
 * Watch" or "Top 10" BEFORE assigning them to any items. Without this,
 * the Tags filter dropdown would always be empty until at least one
 * item had a tag assigned.
 *
 * The union of (vocabulary ∪ in-use) is what the Tags filter dropdown
 * shows. See `uniqueTagsPlus` in useVaultFiltering.ts.
 *
 * Storage key: `cinelog_tag_definitions_v1` (versioned so we can change
 * the shape later without migration conflicts).
 */

const STORAGE_KEY = "cinelog_tag_definitions_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Read the user's saved tag vocabulary. Returns [] on the server / on
 *  first load. The list is sorted alphabetically. */
export function readTagDefinitions(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: filter to strings + dedupe + sort.
    const set = new Set<string>();
    for (const t of parsed) {
      if (typeof t === "string" && t.trim()) set.add(t.trim());
    }
    return [...set].sort();
  } catch {
    return [];
  }
}

/** Write the full tag vocabulary list to localStorage. */
function writeTagDefinitions(tags: string[]): void {
  if (!isBrowser()) return;
  try {
    const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].sort();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    // Notify other tabs / components listening for storage changes.
    window.dispatchEvent(new CustomEvent("cinelog:tags-updated"));
  } catch (err) {
    console.warn("[tagStore] failed to persist tag definitions:", err);
  }
}

/** Add a new tag to the vocabulary. No-op if the tag already exists
 *  (case-insensitive). Trims + dedupes before persisting. */
export function addTagDefinition(tag: string): string[] {
  const trimmed = tag.trim();
  if (!trimmed) return readTagDefinitions();
  const current = readTagDefinitions();
  // Case-insensitive dedup: if "Weekend Watch" exists, adding "weekend watch"
  // is a no-op (returns the existing list unchanged).
  const exists = current.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  if (exists) return current;
  const next = [...current, trimmed];
  writeTagDefinitions(next);
  return next;
}

/** Remove a tag from the vocabulary. Does NOT clear the tag from items —
 *  the caller is responsible for calling `clearTagFromAllItems` separately
 *  if they want to remove it from all vault items.
 *
 *  Returns the updated vocabulary list. */
export function removeTagDefinition(tag: string): string[] {
  const current = readTagDefinitions();
  const next = current.filter((t) => t !== tag);
  writeTagDefinitions(next);
  return next;
}
