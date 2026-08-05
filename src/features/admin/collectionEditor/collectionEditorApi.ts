// src/features/admin/collectionEditor/collectionEditorApi.ts
//
// API client for the Admin Collection Editor Page.
//
// Extracted from AdminCollectionEditorPage.tsx (Phase 8 Chunk 3) so the
// fetch / mutate logic can be unit-tested in isolation and the page
// component file can stay focused on rendering + state.
//
// All functions hit the /api/admin/collections* endpoints. They use
// `credentials: "include"` so the admin cookie auth is sent with every
// request. Errors are surfaced as thrown Error instances with the
// server-provided message (or a fallback HTTP-status-based message).

import type { AdminEntry, AdminUniverse } from "./types";
import { isUuid } from "./sortUtils";

/**
 * Resolve a universe by id (UUID) or slug.
 *
 * Tries the cheap single-fetch path first (GET ?id=…). If the URL
 * segment is a UUID and the fetch 404s (or the URL segment is NOT a
 * UUID), falls back to listing all universes and finding by slug.
 *
 * Trade-off: one extra round-trip for slug URLs; cleaner URLs in the
 * admin address bar.
 *
 * @returns `{ universe, lookupError }` — exactly one of the two is null.
 */
export async function resolveUniverse(
  idOrSlug: string
): Promise<{
  universe: AdminUniverse | null;
  lookupError: string | null;
}> {
  if (!idOrSlug) return { universe: null, lookupError: "No universe id in URL." };

  // Try UUID first (cheap path — single fetch).
  if (isUuid(idOrSlug)) {
    const resp = await fetch(
      `/api/admin/collections?id=${encodeURIComponent(idOrSlug)}`,
      {
        credentials: "include"
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      return { universe: data.universe as AdminUniverse, lookupError: null };
    }
    if (resp.status !== 404) {
      return { universe: null, lookupError: `HTTP ${resp.status}` };
    }
  }

  // Fallback: list all and find by slug.
  const listResp = await fetch("/api/admin/collections", {
    credentials: "include"
  });
  if (!listResp.ok)
    return { universe: null, lookupError: `HTTP ${listResp.status}` };
  const listData = await listResp.json();
  const found = (listData.universes as AdminUniverse[]).find(
    (u) => u.slug === idOrSlug || u.id === idOrSlug
  );
  return {
    universe: found ?? null,
    lookupError: found ? null : "Universe not found."
  };
}

/**
 * Fetch all entries for a universe.
 * Throws on HTTP error so the caller can surface a user-facing message.
 */
export async function fetchEntries(universeId: string): Promise<AdminEntry[]> {
  const resp = await fetch(
    `/api/admin/collections/entries?universe_id=${encodeURIComponent(universeId)}`,
    { credentials: "include" }
  );
  if (!resp.ok) {
    throw new Error(`Failed to load entries (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  return data.entries as AdminEntry[];
}

/**
 * Fetch the subscriber count for a universe.
 * Returns null on any error (subscriber count is non-critical).
 */
export async function fetchSubscriberCount(
  universeId: string
): Promise<number | null> {
  try {
    const resp = await fetch(
      `/api/admin/collections?id=${encodeURIComponent(universeId)}&stats=1`,
      { credentials: "include" }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return typeof data.subscriber_count === "number"
      ? data.subscriber_count
      : null;
  } catch {
    return null;
  }
}

/**
 * Add a new entry to a universe via the TMDB search modal.
 *
 * @returns The new entry (with TMDB metadata already attached) on success,
 *          or throws an Error with the server-provided message on failure.
 */
export async function addEntryFromTmdb(
  universeId: string,
  result: {
    tmdb_id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    release_date: string | null;
  }
): Promise<AdminEntry> {
  const resp = await fetch("/api/admin/collections/entries", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      universe_id: universeId,
      tmdb_id: result.tmdb_id,
      media_type: result.media_type
    })
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) {
    throw new Error(body.error || "Failed to add entry");
  }
  // Append the new entry with TMDB metadata already in hand.
  return {
    ...(body.entry as AdminEntry),
    title: result.title,
    poster_path: result.poster_path,
    release_date: result.release_date
  };
}

/**
 * Save edits to an existing entry (incident_year, admin note, etc.).
 * Throws on HTTP error with the server-provided message.
 */
export async function saveEntry(
  entry: AdminEntry,
  updates: Partial<AdminEntry>
): Promise<void> {
  const resp = await fetch("/api/admin/collections/entries", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: entry.id, ...updates })
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) {
    throw new Error(body.error || "Failed to save entry");
  }
}

/**
 * Delete an entry from a universe.
 * Throws on HTTP error with the server-provided message.
 */
export async function deleteEntry(entry: AdminEntry): Promise<void> {
  const resp = await fetch(
    `/api/admin/collections/entries?id=${encodeURIComponent(entry.id)}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) {
    throw new Error(body.error || "Failed to delete entry");
  }
}

/**
 * Save universe metadata (name, slug, description, color, cover, banner,
 * default_view). Returns the updated universe (from the server if
 * available, otherwise synthesised from the form values).
 *
 * Throws on HTTP error with the server-provided message.
 */
export async function saveUniverseMetadata(
  universeId: string,
  form: {
    name: string;
    slug: string;
    description: string;
    default_view: AdminUniverse["default_view"];
    color: string;
    cover_url: string;
    banner_url: string;
  }
): Promise<AdminUniverse> {
  const resp = await fetch("/api/admin/collections", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: universeId,
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      description: form.description || null,
      default_view: form.default_view,
      color: form.color || null,
      cover_url: form.cover_url || null,
      banner_url: form.banner_url || null
    })
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) {
    throw new Error(body.error || "Failed to save metadata");
  }
  // If the server returned the updated universe, use it; otherwise
  // synthesise one from the form values.
  return (
    body.universe ?? {
      id: universeId,
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      default_view: form.default_view,
      color: form.color || null,
      cover_url: form.cover_url || null,
      banner_url: form.banner_url || null
    }
  );
}
