/**
 * CineLog V2 — Discover Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Pure, side-effect-free utilities used by the read modules:
 *   • error normalisation
 *   • compact column-selection lists (Database Bible §12)
 *
 * Nothing here is part of the public repository API — these functions
 * are only consumed by sibling modules in this folder.
 */

import type { TypedSupabaseClient } from "./discover.types";
import { getClient } from "../../client";

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a Supabase / PostgREST error into a plain `Error`.
 *
 * Supabase errors are already `Error` instances in v2, but the union
 * type includes `null`. This helper keeps call-sites tidy.

/**
 * Compact column list for vault rows returned to the discover layer.
 * Excludes `notes` (heavy, rarely needed for discover UI) and
 * `progress_minutes` (movies-only, not relevant to discover).
 */
export const VAULT_DISCOVER_COLUMNS =
  "id,user_id,tmdb_id,media_type,status,is_favorite,is_pinned,rating,rewatch_count,watched_on,started_at,completed_at,last_activity_at,created_at,updated_at,deleted_at" as const;

/**
 * Compact column list for collection rows returned to the discover layer.
 */
export const COLLECTION_DISCOVER_COLUMNS =
  "id,user_id,collection_type,name,cover_url,color,sort_mode,view_mode,created_at,updated_at" as const;

/**
 * Compact column list for collection_entries rows.
 */
export const ENTRY_DISCOVER_COLUMNS =
  "id,collection_id,vault_id,position,created_at" as const;

/**
 * Compact column list for curated_universes rows.
 */
export const UNIVERSE_DISCOVER_COLUMNS =
  "id,slug,name,description,cover_url,banner_url,color,default_view,created_at,updated_at" as const;

/**
 * Compact column list for curated_universe_entries rows.
 *
 * Phase 4 Task 6 dropped the legacy `timeline_position`,
 * `release_position`, and `story_position` columns — only `position`
 * and `incident_year` remain. The storyline / release / timeline
 * sort modes now derive their order from `incident_year` and the
 * TMDB `release_date` (fetched separately), with `position` as the
 * admin's primary manual order.
 */
export const UNIVERSE_ENTRY_DISCOVER_COLUMNS =
  "id,universe_id,tmdb_id,media_type,position,incident_year,note,created_at" as const;

/**
 * Compact column list for user_universe_subscriptions rows.
 *
 * Phase 4 Task 2 added `is_hidden` — included here so the discover
 * page can exclude hidden universes from the default feed.
 */
export const SUBSCRIPTION_DISCOVER_COLUMNS =
  "id,user_id,universe_id,is_pinned,is_hidden,custom_cover,custom_banner,custom_color,custom_sort,created_at,updated_at" as const;

// ---------------------------------------------------------------------------
// Typed client accessor
// ---------------------------------------------------------------------------

/**
 * Re-export the TypedSupabaseClient type for convenience.
 */
export type { TypedSupabaseClient } from "./discover.types";

/**
 * Convenience: build a fresh per-request client on the server, or the
 * singleton on the browser. Mirrors the pattern used by the other
 * repositories.
 */
export function resolveClient(
  client?: TypedSupabaseClient
): TypedSupabaseClient {
  return client ?? getClient();
}

// Re-export toError from shared (eliminates duplicate)
export { toError } from "../shared";
