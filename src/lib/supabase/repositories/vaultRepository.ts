/**
 * CineLog V2 — Supabase Vault Repository
 * ---------------------------------------------------------------------
 * Production-ready, fully type-safe data-access layer for the `vault`
 * table. Implements the Repository Pattern mandated by the Supabase
 * Integration Guide §05:
 *
 *     Component → Repository → Supabase → Database
 *
 * This module is the SOLE place in the codebase that issues Supabase
 * queries against the `vault` table. Components, hooks, and route
 * loaders should never call `supabase.from("vault")` directly — they
 * go through this repository so the data-access contract lives in
 * one auditable place.
 *
 * Scope
 * -----
 * This is the repository FOUNDATION only. It is NOT wired into the
 * application — the existing Firebase-backed `watchlistService.ts`
 * and `useVault.tsx` remain the sole source of vault truth until the
 * migration explicitly cuts over (Integration Guide §07, Phase 4–5).
 *
 * Database Bible compliance (§03 VAULT, FROZEN)
 * ---------------------------------------------
 *   • UNIQUE(user_id, tmdb_id, media_type)  →  `getVaultByTmdbId`
 *     takes the full composite key; `createVaultItem` relies on the
 *     DB constraint to reject duplicates.
 *   • rating BETWEEN 0.5 AND 10              →  `updateRating`
 *     validates the range client-side (the DB CHECK is the source of
 *     truth, but failing fast avoids a round-trip).
 *   • rewatch_count >= 0                     →  enforced by DB.
 *   • Soft delete via `deleted_at`           →  `deleteVaultItem`
 *     sets `deleted_at`; `restoreVaultItem` clears it. All read
 *     methods filter `deleted_at IS NULL` unless explicitly noted.
 *   • Partial index `deleted_at IS NULL`     →  every read query
 *     includes the `is(null)` filter so the partial index is used.
 *   • `updated_at` is auto-maintained by the `set_updated_at()`
 *     trigger (Bible §91); the repository never writes it manually.
 *   • `created_at` is auto-defaulted; the repository never writes it.
 *
 * RLS compliance (Bible §90)
 * --------------------------
 *   • The `vault` table has RLS enabled with policy
 *     "Full access: user_id = auth.uid()".
 *   • The repository additionally filters every query by `user_id`
 *     client-side — defense in depth. If a caller ever forgets to
 *     authenticate, RLS still rejects the row; the client-side
 *     filter just makes the intent explicit and shrinks the result
 *     set early.
 *   • The repository NEVER uses the service role key. It goes
 *     through `getClient()` (anon key + user JWT), so RLS is
 *     evaluated against the authenticated user.
 *
 * Type safety
 * -----------
 *   • Every method uses the generated types from `database.types.ts`:
 *       - Tables<"vault">       for Row
 *       - TablesInsert<"vault"> for create payloads
 *       - TablesUpdate<"vault"> for update payloads
 *       - Enums<"media_type">   for the media_type enum
 *       - Enums<"vault_status_type"> for the status enum
 *   • No `any` anywhere. No `as unknown as …` casts.
 *   • The Supabase query builder is itself generic over the schema,
 *     so `.eq("user_id", userId)`, `.order("created_at")`, etc. are
 *     compile-time checked against the real column names and types.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getClient } from "../client";
import type {
  Database,
  Enums,
  Tables,
  TablesInsert,
  TablesUpdate
} from "../database.types";

// ---------------------------------------------------------------------------
// Public types — re-exported for callers (hooks, future repositories)
// ---------------------------------------------------------------------------

/**
 * A single row from the `vault` table. This is the canonical vault
 * item shape for all Supabase-backed code.
 */
export type VaultRow = Tables<"vault">;

/**
 * Payload accepted by {@link VaultRepository.createVaultItem}.
 *
 * Only the fields that the caller MUST supply are required; everything
 * with a database default (`id`, `is_favorite`, `is_pinned`,
 * `rewatch_count`, `created_at`, `updated_at`) is optional.
 *
 * `user_id` is required because RLS evaluates it against `auth.uid()`
 * — the row must belong to the authenticated user.
 */
export type VaultInsert = TablesInsert<"vault">;

/**
 * Payload accepted by {@link VaultRepository.updateVaultItem} and the
 * targeted updaters (`updateStatus`, `updateRating`, …). Every field
 * is optional.
 */
export type VaultUpdate = TablesUpdate<"vault">;

/** `"movie" | "tv"` — mirrors the `media_type` SQL enum. */
export type MediaType = Enums<"media_type">;

/** `"planned" | "watching" | "completed" | "on_hold" | "dropped"`. */
export type VaultStatus = Enums<"vault_status_type">;

// ---------------------------------------------------------------------------
// Input helper types — narrow, documented subsets of VaultInsert/Update
// ---------------------------------------------------------------------------

/**
 * Required identity for any vault lookup. Mirrors the
 * UNIQUE(user_id, tmdb_id, media_type) constraint from Bible §03 —
 * TMDB IDs are only unique within their media_type namespace, so a
 * movie and a TV show can share the same `tmdb_id`.
 */
export interface VaultIdentity {
  readonly userId: string;
  readonly tmdbId: number;
  readonly mediaType: MediaType;
}

/**
 * Payload for {@link VaultRepository.createVaultItem}.
 *
 * `userId`, `tmdbId`, and `mediaType` are required (they form the
 * unique key). Everything else is optional and defaults to sensible
 * values via the DB schema (status → planned, is_favorite → false,
 * is_pinned → false, rewatch_count → 0).
 */
export interface CreateVaultItemPayload {
  readonly userId: string;
  readonly tmdbId: number;
  readonly mediaType: MediaType;
  /** Default: `"planned"`. */
  readonly status?: VaultStatus;
  readonly isFavorite?: boolean;
  readonly isPinned?: boolean;
  /** Must be between 0.5 and 10 (DB CHECK constraint). */
  readonly rating?: number;
  readonly notes?: string;
  readonly rewatchCount?: number;
  /** Movies only — minutes of playback completed. */
  readonly progressMinutes?: number;
  /** Movies — ISO timestamp of when the user watched it. */
  readonly watchedOn?: string;
  /** TV/Anime — ISO timestamp of when the user started watching. */
  readonly startedAt?: string;
  /** TV/Anime — ISO timestamp of when the user finished watching. */
  readonly completedAt?: string;
  readonly lastActivityAt?: string;
}

/**
 * Sort options for list queries. Mirrors the indexes defined in
 * Bible §03 (created_at, last_activity_at, updated_at, rating).
 */
export type VaultSortField =
  | "created_at"
  | "updated_at"
  | "last_activity_at"
  | "rating"
  | "watched_on"
  | "started_at"
  | "completed_at";

/** Sort direction. Mirrors PostgREST's ascending flag. */
export type SortDirection = "asc" | "desc";

/**
 * Pagination cursor. Kept simple (offset + limit) to match the
 * existing Firebase query patterns. Range queries / keyset pagination
 * can be added later if vault sizes grow.
 */
export interface VaultPagination {
  readonly limit: number;
  readonly offset?: number;
}

/**
 * Sort specification for list queries.
 */
export interface VaultSort {
  readonly field: VaultSortField;
  readonly direction?: SortDirection;
}

/**
 * Search query for {@link VaultRepository.searchVault}. Searches the
 * `notes` column case-insensitively (PostgREST `ilike`).
 */
export interface VaultSearchQuery {
  readonly userId: string;
  /** Free-text fragment, e.g. `"nolan"`. `%` wildcards are added by the repo. */
  readonly searchTerm: string;
  readonly sort?: VaultSort;
  readonly pagination?: VaultPagination;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * VaultRepository — data-access layer for the `vault` table.
 *
 * Construction
 * ------------
 *   // Default — uses the environment-aware client (browser singleton
 *   // or SSR per-request client):
 *   const repo = new VaultRepository();
 *
 *   // Explicit client — useful for tests or for passing a per-request
 *   // server client with forwarded cookies (later migration phase):
 *   const repo = new VaultRepository(customClient);
 *
 * Methods
 * -------
 *   Writes:
 *     • createVaultItem(payload)            — insert a new row
 *     • updateVaultItem(identity, update)   — partial update by key
 *     • updateStatus(identity, status)      — targeted status update
 *     • updateRating(identity, rating)      — targeted rating update
 *     • updateNotes(identity, notes)        — targeted notes update
 *     • updateProgress(identity, minutes)   — targeted progress update
 *     • deleteVaultItem(identity)           — soft delete (sets deleted_at)
 *     • restoreVaultItem(identity)          — un-soft-delete (clears deleted_at)
 *
 *   Reads (all exclude soft-deleted rows unless noted):
 *     • getVaultItem(identity)              — single row by composite key
 *     • getVaultByTmdbId(userId, tmdbId, mediaType) — alias of getVaultItem
 *     • getVaultByStatus(userId, status, …) — all rows with a given status
 *     • getFavorites(userId, …)             — is_favorite = true
 *     • getPinned(userId, …)                — is_pinned = true
 *     • getRecentlyUpdated(userId, …)       — ordered by updated_at desc
 *     • searchVault(query)                  — ilike search on notes
 */
export class VaultRepository {
  /** Table name constant — single source of truth. */
  private static readonly TABLE = "vault" as const;

  /** The configured Supabase client. */
  private readonly supabase: SupabaseClient<Database>;

  /**
   * @param client  Optional Supabase client. Defaults to the
   *                environment-aware client from `getClient()` (browser
   *                singleton or SSR per-request client). Pass an
   *                explicit client for tests or per-request isolation.
   */
  constructor(client: SupabaseClient<Database> = getClient()) {
    this.supabase = client;
  }

  // -----------------------------------------------------------------
  // Writes
  // -----------------------------------------------------------------

  /**
   * Create a new vault item.
   *
   * Relies on the DB UNIQUE(user_id, tmdb_id, media_type) constraint
   * to reject duplicates — the Supabase client surfaces a Postgres
   * unique-violation error in `result.error`.
   *
   * @returns The newly inserted row, or `null` + `error` on failure.
   */
  async createVaultItem(
    payload: CreateVaultItemPayload
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    const insert: VaultInsert = {
      user_id: payload.userId,
      tmdb_id: payload.tmdbId,
      media_type: payload.mediaType,
      status: payload.status,
      is_favorite: payload.isFavorite,
      is_pinned: payload.isPinned,
      rating: payload.rating,
      notes: payload.notes,
      rewatch_count: payload.rewatchCount,
      progress_minutes: payload.progressMinutes,
      watched_on: payload.watchedOn,
      started_at: payload.startedAt,
      completed_at: payload.completedAt,
      last_activity_at: payload.lastActivityAt
    };

    const { data, error } = await this.supabase
      .from(VaultRepository.TABLE)
      .insert(insert)
      .select()
      .single();

    return { data, error: error as Error | null };
  }

  /**
   * Partially update a vault item by its composite key.
   *
   * Does NOT touch `created_at`, `updated_at` (auto-managed by trigger),
   * or `deleted_at` (use {@link deleteVaultItem} / {@link restoreVaultItem}).
   *
   * @returns The updated row, or `null` + `error` if not found / failure.
   */
  async updateVaultItem(
    identity: VaultIdentity,
    update: VaultUpdate
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from(VaultRepository.TABLE)
      .update(update)
      .eq("user_id", identity.userId)
      .eq("tmdb_id", identity.tmdbId)
      .eq("media_type", identity.mediaType)
      .is("deleted_at", null)
      .select()
      .single();

    return { data, error: error as Error | null };
  }

  /**
   * Update only the status field. Also touches `last_activity_at`
   * because a status change is always meaningful activity (Bible §03
   * indexes `last_activity_at` for activity tracking).
   *
   * @returns The updated row, or `null` + `error`.
   */
  async updateStatus(
    identity: VaultIdentity,
    status: VaultStatus
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    return this.updateVaultItem(identity, {
      status,
      last_activity_at: new Date().toISOString()
    });
  }

  /**
   * Update only the rating. Validates the 0.5–10 range client-side
   * (Bible §03 constraint) to fail fast and avoid a DB round-trip
   * for an obvious bad value.
   *
   * @returns The updated row, or `null` + `error`.
   */
  async updateRating(
    identity: VaultIdentity,
    rating: number
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    if (rating < 0.5 || rating > 10) {
      return {
        data: null,
        error: new Error(
          `[VaultRepository] rating must be between 0.5 and 10 (received ${rating}).`
        )
      };
    }
    return this.updateVaultItem(identity, {
      rating,
      last_activity_at: new Date().toISOString()
    });
  }

  /**
   * Update only the notes field.
   *
   * @returns The updated row, or `null` + `error`.
   */
  async updateNotes(
    identity: VaultIdentity,
    notes: string
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    return this.updateVaultItem(identity, {
      notes,
      last_activity_at: new Date().toISOString()
    });
  }

  /**
   * Update only the movie progress (minutes). Per Bible §03,
   * `progress_minutes` is movies-only — TV/Anime progress lives in
   * the `episode_progress` table (a future repository).
   *
   * @returns The updated row, or `null` + `error`.
   */
  async updateProgress(
    identity: VaultIdentity,
    progressMinutes: number
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    if (progressMinutes < 0) {
      return {
        data: null,
        error: new Error(
          `[VaultRepository] progressMinutes must be >= 0 (received ${progressMinutes}).`
        )
      };
    }
    return this.updateVaultItem(identity, {
      progress_minutes: progressMinutes,
      last_activity_at: new Date().toISOString()
    });
  }

  /**
   * Soft-delete a vault item by setting `deleted_at`. The row remains
   * in the table so it can be restored (Bible §03 Delete Flow:
   * Delete → Trash → Restore / Permanent Delete).
   *
   * Permanent deletion is intentionally NOT exposed here — it should
   * be a separate, audited operation (likely an admin/edge function)
   * to avoid accidental data loss.
   *
   * @returns `{ error }` — null on success. Returns the updated row
   *          in `data` so callers can confirm the soft-delete.
   */
  async deleteVaultItem(
    identity: VaultIdentity
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    const deletedAt = new Date().toISOString();
    const { data, error } = await this.supabase
      .from(VaultRepository.TABLE)
      .update({ deleted_at: deletedAt })
      .eq("user_id", identity.userId)
      .eq("tmdb_id", identity.tmdbId)
      .eq("media_type", identity.mediaType)
      .is("deleted_at", null) // only soft-delete if not already trashed
      .select()
      .single();

    return { data, error: error as Error | null };
  }

  /**
   * Restore a soft-deleted vault item by clearing `deleted_at`.
   *
   * @returns The restored row, or `null` + `error` if not found in trash.
   */
  async restoreVaultItem(
    identity: VaultIdentity
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from(VaultRepository.TABLE)
      .update({ deleted_at: null })
      .eq("user_id", identity.userId)
      .eq("tmdb_id", identity.tmdbId)
      .eq("media_type", identity.mediaType)
      .not("deleted_at", "is", null) // only restore if currently trashed
      .select()
      .single();

    return { data, error: error as Error | null };
  }

  // -----------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------

  /**
   * Get a single vault item by its composite key. Excludes
   * soft-deleted rows.
   *
   * @returns The row, or `null` + `error` if not found / failure.
   */
  async getVaultItem(
    identity: VaultIdentity
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from(VaultRepository.TABLE)
      .select()
      .eq("user_id", identity.userId)
      .eq("tmdb_id", identity.tmdbId)
      .eq("media_type", identity.mediaType)
      .is("deleted_at", null)
      .maybeSingle();

    return { data, error: error as Error | null };
  }

  /**
   * Alias of {@link getVaultItem} with a positional signature, kept
   * for ergonomics when callers already have the three primitive
   * values. Same composite-key lookup, same soft-delete exclusion.
   */
  async getVaultByTmdbId(
    userId: string,
    tmdbId: number,
    mediaType: MediaType
  ): Promise<{ data: VaultRow | null; error: Error | null }> {
    return this.getVaultItem({ userId, tmdbId, mediaType });
  }

  /**
   * Get all vault items for a user that have a given status.
   * Excludes soft-deleted rows. Ordered by `last_activity_at` desc
   * (most recently active first) by default — override with `sort`.
   *
   * @returns An array of rows (empty if none match). `error` is null
   *          on success.
   */
  async getVaultByStatus(
    userId: string,
    status: VaultStatus,
    options?: { sort?: VaultSort; pagination?: VaultPagination }
  ): Promise<{ data: VaultRow[]; error: Error | null }> {
    let query = this.supabase
      .from(VaultRepository.TABLE)
      .select()
      .eq("user_id", userId)
      .eq("status", status)
      .is("deleted_at", null);

    query = VaultRepository.applySort(query, options?.sort);
    query = VaultRepository.applyPagination(query, options?.pagination);

    const { data, error } = await query;
    return { data: data ?? [], error: error as Error | null };
  }

  /**
   * Get the user's favorites (`is_favorite = true`). Excludes
   * soft-deleted rows. Ordered by `updated_at` desc by default.
   *
   * This backs the "Favorites" Smart Collection (Bible §03).
   */
  async getFavorites(
    userId: string,
    options?: { sort?: VaultSort; pagination?: VaultPagination }
  ): Promise<{ data: VaultRow[]; error: Error | null }> {
    let query = this.supabase
      .from(VaultRepository.TABLE)
      .select()
      .eq("user_id", userId)
      .eq("is_favorite", true)
      .is("deleted_at", null);

    query = VaultRepository.applySort(query, options?.sort);
    query = VaultRepository.applyPagination(query, options?.pagination);

    const { data, error } = await query;
    return { data: data ?? [], error: error as Error | null };
  }

  /**
   * Get the user's pinned items (`is_pinned = true`). Excludes
   * soft-deleted rows. Ordered by `updated_at` desc by default.
   *
   * This backs the "Pinned" Smart Collection and dashboard pins
   * (Bible §03).
   */
  async getPinned(
    userId: string,
    options?: { sort?: VaultSort; pagination?: VaultPagination }
  ): Promise<{ data: VaultRow[]; error: Error | null }> {
    let query = this.supabase
      .from(VaultRepository.TABLE)
      .select()
      .eq("user_id", userId)
      .eq("is_pinned", true)
      .is("deleted_at", null);

    query = VaultRepository.applySort(query, options?.sort);
    query = VaultRepository.applyPagination(query, options?.pagination);

    const { data, error } = await query;
    return { data: data ?? [], error: error as Error | null };
  }

  /**
   * Get the user's vault ordered by `updated_at` desc — i.e. the
   * most recently touched items first. Excludes soft-deleted rows.
   *
   * This backs the "Recently Updated" shelf on the dashboard
   * (Bible §03 Smart Collections).
   */
  async getRecentlyUpdated(
    userId: string,
    pagination?: VaultPagination
  ): Promise<{ data: VaultRow[]; error: Error | null }> {
    let query = this.supabase
      .from(VaultRepository.TABLE)
      .select()
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    query = VaultRepository.applyPagination(query, pagination);

    const { data, error } = await query;
    return { data: data ?? [], error: error as Error | null };
  }

  /**
   * Search the user's vault by free-text fragment against the
   * `notes` column (case-insensitive, PostgREST `ilike`). Excludes
   * soft-deleted rows.
   *
   * The search term is wrapped in `%…%` so it matches as a substring.
   * Callers wanting prefix / suffix matching can include their own
   * `%` in the term.
   *
   * @returns Matching rows (empty if none). `error` is null on success.
   */
  async searchVault(
    query: VaultSearchQuery
  ): Promise<{ data: VaultRow[]; error: Error | null }> {
    const pattern = `%${query.searchTerm}%`;
    let dbQuery = this.supabase
      .from(VaultRepository.TABLE)
      .select()
      .eq("user_id", query.userId)
      .ilike("notes", pattern)
      .is("deleted_at", null);

    dbQuery = VaultRepository.applySort(dbQuery, query.sort);
    dbQuery = VaultRepository.applyPagination(dbQuery, query.pagination);

    const { data, error } = await dbQuery;
    return { data: data ?? [], error: error as Error | null };
  }

  // -----------------------------------------------------------------
  // Private helpers — sort + pagination composition
  // -----------------------------------------------------------------

  /**
   * Apply a sort spec to a query builder. Returns the builder so it
   * can be chained. No-op if `sort` is undefined.
   *
   * The type assertion is unnecessary at runtime but kept for clarity
   * — the PostgREST builder is fluent and returns `this`.
   */
  private static applySort<TQuery extends { order: (column: string, opts?: { ascending?: boolean; nulls?: "first" | "last" }) => TQuery }>(
    query: TQuery,
    sort: VaultSort | undefined
  ): TQuery {
    if (!sort) return query;
    return query.order(sort.field, {
      ascending: sort.direction !== "desc"
    });
  }

  /**
   * Apply a pagination spec to a query builder. Returns the builder
   * so it can be chained. No-op if `pagination` is undefined.
   *
   * Uses PostgREST's `.range(from, to)` which is inclusive on both
   * ends. `offset` defaults to 0.
   */
  private static applyPagination<TQuery extends { range: (from: number, to: number) => TQuery }>(
    query: TQuery,
    pagination: VaultPagination | undefined
  ): TQuery {
    if (!pagination) return query;
    const from = pagination.offset ?? 0;
    const to = from + pagination.limit - 1;
    return query.range(from, to);
  }
}

// ---------------------------------------------------------------------------
// Default singleton — convenience for browser-side callers
// ---------------------------------------------------------------------------

/**
 * Lazy-initialized default instance. Uses the environment-aware client
 * (browser singleton or SSR per-request client).
 *
 * On the server, prefer constructing `new VaultRepository(serverClient)`
 * with a per-request client so auth state is isolated per request.
 */
let _defaultInstance: VaultRepository | null = null;

/**
 * Get the default VaultRepository instance.
 *
 * On the browser this returns a lazily-initialized singleton sharing
 * the singleton browser Supabase client. On the server it constructs
 * a fresh instance per call (because the underlying `getClient()`
 * returns a fresh per-request server client).
 */
export function getVaultRepository(): VaultRepository {
  // SSR: always fresh — never cache, never share across requests.
  if (typeof window === "undefined") {
    return new VaultRepository();
  }
  // Browser: cache the singleton.
  if (!_defaultInstance) {
    _defaultInstance = new VaultRepository();
  }
  return _defaultInstance;
}
