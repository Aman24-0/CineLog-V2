/**
 * CineLog V2 — Dashboard Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Pure, side-effect-free utilities used by the read module:
 *   • error normalisation
 *   • pagination composition
 *   • Continue Watching filter expression (Database Bible §03)
 *   • compact column-selection lists (Database Bible §12)
 *
 * Nothing here is part of the public repository API — these functions
 * are only consumed by sibling modules in this folder.
 */

import { getClient } from "../../client";
import type {
  DashboardPagination,
  TypedSupabaseClient
} from "./dashboard.types";

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a Supabase / PostgREST error into a plain `Error`.
 *
 * Supabase errors are already `Error` instances in v2, but the union
 * type includes `null`. This helper keeps call-sites tidy.
/**
 * Apply a pagination spec to a query builder. Returns the builder so it
 * can be chained. No-op if `pagination` is undefined.
 *
 * Uses PostgREST's `.range(from, to)` which is inclusive on both ends.
 */
export function applyPagination<
  TQuery extends { range: (from: number, to: number) => TQuery }
>(query: TQuery, pagination: DashboardPagination | undefined): TQuery {
  if (!pagination) return query;
  const from = pagination.offset ?? 0;
  const to = from + pagination.limit - 1;
  return query.range(from, to);
}

// ---------------------------------------------------------------------------
// Continue Watching filter expression (Database Bible §03)
// ---------------------------------------------------------------------------

/**
 * PostgREST `or()` filter expression for the "Continue Watching" rule
 * (Database Bible §03):
 *
 *   Movies: status = "watching" AND watched_on IS NULL
 *   TV/Anime: status = "watching" AND completed_at IS NULL
 *
 * Combined into a single query:
 *   status = "watching"
 *   AND (watched_on IS NULL OR completed_at IS NULL)
 *
 * The `status = "watching"` part is applied separately by the caller
 * via `.eq("status", "watching")`; this helper returns only the
 * parenthesised OR clause for use with `.or(...)`.
 *
 * Note: PostgREST's `.or()` parses commas as top-level OR separators,
 * so column predicates inside the OR must use dot syntax
 * (`watched_on.is.null`).
 */
export const CONTINUE_WATCHING_OR_FILTER =
  "watched_on.is.null,completed_at.is.null" as const;

// ---------------------------------------------------------------------------
// Column-selection helpers — request only the columns the dashboard needs
// (Database Bible §12: "Avoid unnecessary select(*)")
// ---------------------------------------------------------------------------

/**
 * Column list for vault rows returned to the dashboard.
 *
 * Includes ALL user-owned columns so that `vaultRowToWatchlistItem` can
 * populate every field the UI needs (seasonDates, rewatchDates, notes,
 * etc.) without a second fetch. Previously this excluded `notes`,
 * `season_dates`, `rewatch_dates`, `season_rewatch_count`, and
 * `season_rewatch_dates` to "keep payloads small" — but that meant the
 * edit form's season date pickers were always empty, the rewatch badge
 * never appeared, and the notes preview was missing for items loaded
 * via the dashboard path (which is the ONLY path the main UI uses).
 *
 * The payload cost is small (season_dates is jsonb, typically < 200
 * bytes per item; rewatch_dates is a short text array) and is dwarfed
 * by the TMDB metadata fetch that follows. Fetching all columns in one
 * query is far cheaper than the N+1 pattern that would otherwise be
 * needed to fill in the missing fields.
 */
export const VAULT_DASHBOARD_COLUMNS =
  "id,user_id,tmdb_id,media_type,status,is_favorite,is_pinned,rating,notes,rewatch_count,rewatch_dates,progress_minutes,watched_on,started_at,completed_at,last_activity_at,created_at,updated_at,deleted_at,season_dates,season_rewatch_count,season_rewatch_dates,tag" as const;

/**
 * Compact column list for collection rows returned to the dashboard.
 */
export const COLLECTION_DASHBOARD_COLUMNS =
  "id,user_id,collection_type,name,cover_url,color,sort_mode,view_mode,created_at,updated_at" as const;

/**
 * Compact column list for episode_progress rows returned to the dashboard.
 */
export const EPISODE_PROGRESS_DASHBOARD_COLUMNS =
  "id,vault_id,season_number,episode_number,progress_minutes,is_completed,watched_at,updated_at" as const;

// ---------------------------------------------------------------------------
// Typed client accessor — kept here so the read module does not need to
// import the client module directly (avoids a circular dependency).
// ---------------------------------------------------------------------------

/**
 * Re-export the TypedSupabaseClient type for convenience.
 */
export type { TypedSupabaseClient } from "./dashboard.types";

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
