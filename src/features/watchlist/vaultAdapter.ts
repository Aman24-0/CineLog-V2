/**
 * CineLog V2 — Vault Read Adapter
 * ---------------------------------------------------------------------
 * Phase 7.1 — Vault READ Migration
 *
 * Maps Supabase `VaultRow` (snake_case, lowercase enum status) to the
 * application's `WatchlistItem` (camelCase, Title Case status) so the
 * existing UI components can consume Supabase data without modification.
 *
 * Also provides `fetchVaultFromSupabase` — a helper that loads ALL vault
 * items for a user by calling `VaultRepository.getVaultByStatus` for each
 * of the 5 statuses in parallel and merging the results. The
 * VaultRepository does not expose a "get all" method, so this adapter
 * composes the existing repository methods (no repository modification
 * needed, no duplicated query logic).
 *
 * Architecture:
 *   useVault (context) → vaultAdapter → VaultRepository → Supabase
 *
 * Write path (unchanged):
 *   useVault (context) → watchlistService → Firestore
 *
 * The adapter is READ-ONLY — it never writes. After a Firestore write,
 * the caller (useVault) optimistically updates the local signal.
 */

import { getVaultRepository } from "~/lib/supabase/repositories";
import type { VaultRow, VaultStatus } from "~/lib/supabase/repositories";
import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Status mapping: Supabase lowercase enum → Firestore Title Case
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `vault_status_type` enum value to the Firestore Title
 * Case status the UI expects.
 *
 * Supabase: "planned" | "watching" | "completed" | "on_hold" | "dropped"
 * Firestore: "Planned" | "Watching" | "Completed" | "Plan to Watch"
 *
 * "on_hold" and "dropped" have no exact Firestore equivalent — both map
 * to "Plan to Watch" (the closest existing status). This is a
 * transitional mapping; once the UI is updated to support the full
 * 5-status enum, this can be simplified to a direct case conversion.
 */
const STATUS_MAP: Record<VaultStatus, WatchlistItem["status"]> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  on_hold: "Plan to Watch",
  dropped: "Plan to Watch"
};

// ---------------------------------------------------------------------------
// Row → WatchlistItem mapping
// ---------------------------------------------------------------------------

/**
 * Map a single Supabase `VaultRow` to the application's `WatchlistItem`.
 *
 * Field mapping:
 *   vault.tmdb_id (number)   → WatchlistItem.id (string)
 *   vault.media_type          → WatchlistItem.media_type (same)
 *   vault.status (lowercase)  → WatchlistItem.status (Title Case)
 *   vault.rating              → WatchlistItem.rating
 *   vault.notes               → WatchlistItem.notes
 *   vault.watched_on          → WatchlistItem.watchDate
 *   vault.created_at          → WatchlistItem.addedAt
 *   vault.updated_at          → WatchlistItem.updatedAt
 *
 * TMDB metadata fields (title, poster_path, genresList, etc.) are NOT
 * stored in the Supabase vault table — they are left undefined. The UI
 * already handles undefined TMDB fields via conditional rendering
 * (<Show when={item.poster_path}>).
 *
 * TV episode tracking fields (season, episode, seasons) are also NOT in
 * the vault table — they live in the `episode_progress` table. They are
 * left undefined here; a future phase can enrich the items with
 * episode_progress data.
 */
export function vaultRowToWatchlistItem(row: VaultRow): WatchlistItem {
  return {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    status: STATUS_MAP[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate: row.watched_on ?? undefined,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    // TMDB metadata fields — not in vault table, left undefined
    // (UI handles via conditional rendering)
    // TV episode fields — in episode_progress table, left undefined
    // (future phase can enrich)
  };
}

// ---------------------------------------------------------------------------
// fetchVaultFromSupabase — load ALL vault items for a user
// ---------------------------------------------------------------------------

/**
 * Load ALL non-deleted vault items for a user from Supabase, ordered by
 * `created_at` desc (matching the previous Firestore `orderBy("addedAt",
 * "desc")`).
 *
 * The VaultRepository does not expose a "get all" method, so this helper
 * calls `getVaultByStatus` for each of the 5 statuses in parallel and
 * merges the results. Each call returns at most 1000 items (the default
 * limit); for users with more than 1000 items per status, pagination
 * would be needed (not a concern for CineLog's scale).
 *
 * @param userId  The Supabase user id (= auth.users.id).
 * @returns An array of `WatchlistItem` (empty if no items or error).
 */
export async function fetchVaultFromSupabase(userId: string): Promise<WatchlistItem[]> {
  const repo = getVaultRepository();
  const statuses: VaultStatus[] = ["planned", "watching", "completed", "on_hold", "dropped"];

  // Fetch all 5 statuses in parallel.
  const results = await Promise.all(
    statuses.map((status) => repo.getVaultByStatus(userId, status, { pagination: { limit: 1000 } }))
  );

  // Check for errors — if any status query failed, log and skip it
  // (partial data is better than no data).
  const allRows: VaultRow[] = [];
  for (const result of results) {
    if (result.error) {
      console.error("[vaultAdapter] Error fetching vault status:", result.error);
      continue;
    }
    allRows.push(...result.data);
  }

  // Map to WatchlistItem and sort by created_at desc (matching the
  // previous Firestore orderBy("addedAt", "desc")).
  const items = allRows.map(vaultRowToWatchlistItem);
  items.sort((a, b) => {
    const timeA = typeof a.addedAt === "string" ? new Date(a.addedAt).getTime() : 0;
    const timeB = typeof b.addedAt === "string" ? new Date(b.addedAt).getTime() : 0;
    return timeB - timeA;
  });

  return items;
}
