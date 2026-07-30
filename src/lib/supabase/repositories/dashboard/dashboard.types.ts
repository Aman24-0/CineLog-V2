/**
 * CineLog V2 — Dashboard Repository: Shared Types
 * ---------------------------------------------------------------------
 * Type definitions shared across the dashboard repository modules.
 * The DashboardRepository is a READ-ONLY aggregation layer — it never
 * writes, so these types describe only query inputs and result shapes.
 *
 * Every type here is derived from the official CLI-generated
 * `database.types.ts` — no hand-rolled shapes, no `any`.
 */

import type { Tables } from "../../database.types";

// ---------------------------------------------------------------------------
// Row aliases — the tables the dashboard aggregates from
// ---------------------------------------------------------------------------

/** A single row from the `vault` table (the dashboard's primary source). */
export type VaultRow = Tables<"vault">;

/** A single row from the `collections` table. */
export type CollectionRow = Tables<"collections">;

/** A single row from the `collection_entries` table. */
export type CollectionEntryRow = Tables<"collection_entries">;

/** A single row from the `episode_progress` table. */
export type EpisodeProgressRow = Tables<"episode_progress">;

// ---------------------------------------------------------------------------
// Pagination — shared across list-style dashboard queries
// ---------------------------------------------------------------------------

/** Pagination cursor (offset + limit). Identical shape to other repos. */
export interface DashboardPagination {
  readonly limit: number;
  readonly offset?: number;
}

// ---------------------------------------------------------------------------
// Stats — aggregate counts returned by getDashboardStats / getVaultCounts /
// getCollectionCounts
// ---------------------------------------------------------------------------

/**
 * Per-status vault counts. Mirrors the `vault_status_type` enum values
 * (Database Bible §03): planned / watching / completed / on_hold / dropped.
 *
 * NOTE: The properties are NOT `readonly` because this object is used as
 * a mutable counter during client-side aggregation in `getVaultCounts`
 * (we increment `planned++`, `watching++`, etc. in a loop). Making them
 * `readonly` would cause a TS2540 compile error at every increment site.
 *
 * The returned object (wrapped in `VaultCounts`) IS exposed read-only to
 * consumers via `VaultCounts.byStatus: VaultStatusCounts`, but TypeScript
 * does not enforce readonly-ness at runtime — callers can mutate it if
 * they really try. This is acceptable for a counts payload.
 */
export interface VaultStatusCounts {
  planned: number;
  watching: number;
  completed: number;
  onHold: number;
  dropped: number;
}

/**
 * Aggregate vault counts for the dashboard stats cards.
 */
export interface VaultCounts {
  /** Total non-deleted vault items. */
  readonly total: number;
  readonly byStatus: VaultStatusCounts;
  /** Items with `is_favorite = true`. */
  readonly favorites: number;
  /** Items with `is_pinned = true`. */
  readonly pinned: number;
}

/**
 * Aggregate collection counts for the dashboard stats cards.
 */
export interface CollectionCounts {
  /** Total non-deleted collections owned by the user. */
  readonly total: number;
  readonly user: number;
  readonly curated: number;
  readonly smart: number;
}

/**
 * The full dashboard stats payload returned by {@link getDashboardStats}.
 * Combines vault + collection counts into one round-trip-friendly shape.
 */
export interface DashboardStats {
  readonly vault: VaultCounts;
  readonly collections: CollectionCounts;
}

// ---------------------------------------------------------------------------
// Continue Watching — enriched vault row with its latest episode progress
// ---------------------------------------------------------------------------

/**
 * A vault item enriched with its most recent episode-progress row.
 * Returned by {@link getContinueWatching} for TV/Anime items; for
 * movies the `latestProgress` field is `null` (movies do not use the
 * `episode_progress` table — Database Bible §06).
 */
export interface ContinueWatchingItem {
  readonly vault: VaultRow;
  readonly latestProgress: EpisodeProgressRow | null;
}

// ---------------------------------------------------------------------------
// Result types — uniform `{ data, error }` shape across all methods
// ---------------------------------------------------------------------------

/**
 * Result of a single-row or scalar read. `data` is `null` on error.
 */
export interface DashboardResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

/**
 * Result of a list read. `data` is always an array (empty on error or
 * when no rows match).
 */
export interface DashboardListResult<T> {
  readonly data: T[];
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Internal: typed Supabase client used by all repository modules
// ---------------------------------------------------------------------------

/**
 * The Supabase client generic over the CineLog `Database` schema.
 * Shared by all read functions so they get full type inference on
 * `.from("vault")`, `.eq("user_id", …)`, etc.
 */
export type TypedSupabaseClient =
  import("@supabase/supabase-js").SupabaseClient<
    import("../../database.types").Database
  >;
