// src/shared/utils/vaultMatch.ts
import type { WatchlistItem } from "~/shared/types";

/**
 * vaultMatch — the SINGLE source of truth for matching a TMDB title
 * against the user's vault.
 *
 * ROOT CAUSE THIS EXISTS:
 *   TMDB IDs are NOT globally unique. They are only unique within their
 *   `media_type` namespace. For example:
 *     movie/1398 → Stalker (1979, Tarkovsky)
 *     tv/1398    → The Sopranos
 *   These are two completely different titles that happen to share the
 *   numeric ID 1398.
 *
 *   Before this helper existed, every vault lookup matched by `id` alone:
 *     vault.find((m) => String(m.id) === String(baseItem.id))
 *   This caused a critical bug: if the user had The Sopranos (tv/1398)
 *   in their vault and searched for Stalker (movie/1398), the lookup
 *   would match The Sopranos and open The Sopranos' Details page
 *   instead of Stalker's.
 *
 *   The fix: match on BOTH `id` AND `media_type`. This helper
 *   centralizes that logic so every lookup site is correct by
 *   construction and the bug can never regress.
 *
 * USAGE:
 *   import { findInVault, isInVault } from "~/shared/utils/vaultMatch";
 *
 *   const vaultItem = findInVault(vault, baseItem);
 *   const inVault = isInVault(vault, { id: 1398, media_type: "movie" });
 */

/**
 * findInVault — find a vault item matching the given TMDB identity.
 * Matches on BOTH id AND media_type to avoid cross-namespace collisions.
 *
 * Accepts either a full WatchlistItem (which has id + media_type) or a
 * minimal { id, media_type } shape (e.g. from TMDBTitle).
 *
 * Returns the matching WatchlistItem or null.
 */
export function findInVault(
  vault: WatchlistItem[],
  title: { id: string | number; media_type: "movie" | "tv" } | WatchlistItem | null | undefined
): WatchlistItem | null {
  if (!title) return null;
  const id = String(title.id);
  const mediaType = title.media_type;
  return vault.find((m) => String(m.id) === id && m.media_type === mediaType) ?? null;
}

/**
 * isInVault — boolean check for whether a TMDB title is in the vault.
 * Matches on BOTH id AND media_type.
 */
export function isInVault(
  vault: WatchlistItem[],
  title: { id: string | number; media_type: "movie" | "tv" } | WatchlistItem | null | undefined
): boolean {
  return findInVault(vault, title) !== null;
}

/**
 * vaultIdKey — produce a stable composite key for a TMDB title.
 * Format: "{media_type}/{id}" — e.g. "movie/1398", "tv/1398".
 *
 * This is useful for Set-based lookups (e.g. the Search page's vaultIds)
 * where you need to check membership without scanning the full vault.
 *
 * The key includes media_type precisely because id alone is ambiguous
 * across TMDB namespaces.
 */
export function vaultIdKey(
  title: { id: string | number; media_type: "movie" | "tv" } | WatchlistItem | null | undefined
): string | null {
  if (!title) return null;
  return `${title.media_type}/${title.id}`;
}

/**
 * buildVaultKeySet — build a Set of composite keys for O(1) membership checks.
 * Every key is "{media_type}/{id}" — never just the id.
 */
export function buildVaultKeySet(vault: WatchlistItem[]): Set<string> {
  return new Set(vault.map((m) => vaultIdKey(m)).filter((k): k is string => k !== null));
}
