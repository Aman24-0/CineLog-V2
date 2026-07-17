/**
 * CineLog V2 — Vault Repository: Shared Types
 * ---------------------------------------------------------------------
 * Type definitions for the `vault` table (Database Bible §03).
 */

import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from "../../database.types";

// ---------------------------------------------------------------------------
// Row / Insert / Update aliases
// ---------------------------------------------------------------------------

export type VaultRow = Tables<"vault">;
export type VaultInsert = TablesInsert<"vault">;
export type VaultUpdate = TablesUpdate<"vault">;

// ---------------------------------------------------------------------------
// Enum aliases
// ---------------------------------------------------------------------------

export type MediaType = Enums<"media_type">;
export type VaultStatus = Enums<"vault_status_type">;

// ---------------------------------------------------------------------------
// Input helper types
// ---------------------------------------------------------------------------

export interface VaultIdentity {
  readonly userId: string;
  readonly tmdbId: number;
  readonly mediaType: MediaType;
}

export interface CreateVaultItemPayload {
  readonly userId: string;
  readonly tmdbId: number;
  readonly mediaType: MediaType;
  readonly status?: VaultStatus;
  readonly isFavorite?: boolean;
  readonly isPinned?: boolean;
  readonly rating?: number;
  readonly notes?: string;
  readonly rewatchCount?: number;
  readonly rewatchDates?: string[];
  readonly progressMinutes?: number;
  readonly watchedOn?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly lastActivityAt?: string;
  /** Per-season watch dates for TV series — map of season number → { start, end }. */
  readonly seasonDates?: Record<string, { start: string; end: string }>;
  /** Number of full-series re-watch passes (TV only). */
  readonly seasonRewatchCount?: number;
  /** Per-re-watch per-season start/end maps (TV only). */
  readonly seasonRewatchDates?: Record<string, { start: string; end: string }>[];
  /** Original add timestamp — preserved across imports so the timeline stays accurate. */
  readonly createdAt?: string;
  // ── Display metadata (stored in vault to avoid TMDB re-fetches) ──
  /** TMDB display title for movies. */
  readonly title?: string | null;
  /** TMDB display name for TV series. */
  readonly name?: string | null;
  /** TMDB poster path (e.g. /abc123.jpg). */
  readonly posterPath?: string | null;
  /** TMDB backdrop path. */
  readonly backdropPath?: string | null;
  /** TMDB release date string. */
  readonly releaseDate?: string | null;
  /** TMDB first air date string. */
  readonly firstAirDate?: string | null;
  /** TMDB vote_average (0-10). */
  readonly tmdbVoteAverage?: number | null;
  /** TMDB genres array. */
  readonly genres?: unknown[] | null;
}

export type VaultSortField =
  | "created_at" | "updated_at" | "last_activity_at"
  | "rating" | "watched_on" | "started_at" | "completed_at";

export type SortDirection = "asc" | "desc";

export interface VaultPagination {
  readonly limit: number;
  readonly offset?: number;
}

export interface VaultSort {
  readonly field: VaultSortField;
  readonly direction?: SortDirection;
}

export interface VaultSearchQuery {
  readonly userId: string;
  readonly searchTerm: string;
  readonly sort?: VaultSort;
  readonly pagination?: VaultPagination;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface VaultItemResult {
  readonly data: VaultRow | null;
  readonly error: Error | null;
}

export interface VaultListResult {
  readonly data: VaultRow[];
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Typed Supabase client
// ---------------------------------------------------------------------------

export type TypedSupabaseClient = import("@supabase/supabase-js").SupabaseClient<Database>;
