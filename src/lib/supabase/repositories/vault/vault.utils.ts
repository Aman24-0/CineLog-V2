/**
 * CineLog V2 — Vault Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Validation, payload mapping, sort/pagination, and error normalisation.
 */

import type {
  CreateVaultItemPayload,
  VaultInsert,
  VaultPagination,
  VaultSort
} from "./vault.types";
import { toError } from "../shared";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateRating(rating: number): Error | null {
  if (rating < 0.5 || rating > 10) {
    return new Error(`[VaultRepository] rating must be between 0.5 and 10 (received ${rating}).`);
  }
  return null;
}

export function validateProgressMinutes(minutes: number): Error | null {
  if (minutes < 0) {
    return new Error(`[VaultRepository] progressMinutes must be >= 0 (received ${minutes}).`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payload mapping
// ---------------------------------------------------------------------------

/**
 * Build a vault insert row from a payload.
 *
 * @param payload  The user-owned vault fields to write.
 * @param options  Optional flags:
 *   - `includeExtendedFields` (default true): when false, omits the
 *     v2.2/v2.3 extended columns (`rewatch_dates`, `season_dates`,
 *     `season_rewatch_count`, `season_rewatch_dates`). Used by the
 *     batch upsert fallback path when those columns don't exist in the
 *     user's database (migration not run yet) — every upsert that
 *     touches them would otherwise fail with "column does not exist".
 */
export function toVaultInsert(
  payload: CreateVaultItemPayload,
  options?: { includeExtendedFields?: boolean },
): VaultInsert {
  const includeExtended = options?.includeExtendedFields ?? true;
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
    last_activity_at: payload.lastActivityAt,
  };

  // Extended fields (v2.2 / v2.3) — only set when provided so we don't
  // clobber DB defaults with null on partial inserts.
  if (includeExtended) {
    if (payload.rewatchDates !== undefined) {
      insert.rewatch_dates = payload.rewatchDates;
    }
    if (payload.seasonDates !== undefined) {
      insert.season_dates = payload.seasonDates as unknown as import("../../database.types").Json;
    }
    if (payload.seasonRewatchCount !== undefined) {
      insert.season_rewatch_count = payload.seasonRewatchCount;
    }
    if (payload.seasonRewatchDates !== undefined) {
      insert.season_rewatch_dates = payload.seasonRewatchDates as unknown as import("../../database.types").Json;
    }
  }
  if (payload.createdAt !== undefined) {
    insert.created_at = payload.createdAt;
  }

  return insert;
}

/**
 * Detect whether a Supabase/PostgREST error indicates that a column
 * referenced in the insert does not exist in the live database schema.
 *
 * Used by the batch upsert fallback path: when `season_dates` /
 * `rewatch_dates` / `season_rewatch_count` / `season_rewatch_dates`
 * columns haven't been added yet (migration not run), every batch that
 * includes those fields fails permanently. We detect that, retry the
 * batch WITHOUT the extended fields, and the insert succeeds using
 * only the base columns that have existed since v1.0 of the schema.
 *
 * Error indicators (PostgreSQL + PostgREST):
 *   - SQLSTATE 42703 ("undefined_column")
 *   - PostgREST code PGRST204 ("schemaCacheMiss" / column not found)
 *   - Message pattern: "column \"X\" does not exist"
 *   - Message pattern: "Could not find the column `X` in the schema cache"
 *
 * We deliberately do NOT match on the bare phrase "does not exist"
 * because that would also match "relation vault does not exist" (missing
 * table) — retrying without extended fields wouldn't help that case.
 */
/**
 * Known extended columns that may not exist in older database schemas.
 * Used by the schema drift detection logic to identify specific
 * column-missing errors rather than relying on fragile string matching.
 */
const EXTENDED_COLUMNS = [
  "rewatch_dates",
  "season_dates",
  "season_rewatch_count",
  "season_rewatch_dates",
] as const;

/**
 * Detect whether a Supabase/PostgREST error indicates that a column
 * referenced in the insert does not exist in the live database schema.
 *
 * Detection strategy (ordered by reliability):
 *   1. PostgreSQL SQLSTATE 42703 ("undefined_column") — most reliable.
 *   2. PostgREST code PGRST204 ("schemaCacheMiss") — schema-level miss.
 *   3. Error message contains a known extended column name AND an
 *      indication of absence ("does not exist", "not found", "unknown").
 *   4. PostgREST "Could not find the column" message pattern.
 *
 * We check against a whitelist of known extended columns rather than
 * matching arbitrary "column X does not exist" patterns. This prevents
 * false positives from unrelated column errors (e.g., typos in column
 * names we control).
 */
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { message?: string; code?: string; details?: unknown };
  const msg = String(e?.message ?? "").toLowerCase();
  const code = String(e?.code ?? "").toLowerCase();
  const details = typeof e?.details === "string" ? e.details.toLowerCase() : "";
  const combined = `${msg} ${details}`;

  // 1. Specific PostgreSQL SQLSTATE for undefined column.
  if (code === "42703" || code === "pgrst204") return true;

  // 2. Check if any known extended column is mentioned with absence indicators.
  const absenceIndicators = ["does not exist", "not found", "unknown column", "missing"];
  for (const col of EXTENDED_COLUMNS) {
    if (combined.includes(col)) {
      for (const indicator of absenceIndicators) {
        if (combined.includes(indicator)) return true;
      }
    }
  }

  // 3. PostgREST "Could not find the column" message.
  if (combined.includes("could not find the column")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Sort + pagination composition
// ---------------------------------------------------------------------------

export function applySort<TQuery extends { order: (column: string, opts?: { ascending?: boolean }) => TQuery }>(
  query: TQuery,
  sort: VaultSort | undefined
): TQuery {
  if (!sort) return query;
  return query.order(sort.field, { ascending: sort.direction !== "desc" });
}

/**
 * Maximum rows returned per query when no explicit pagination is provided.
 * Prevents unbounded reads that could fetch thousands of rows in a single
 * request, causing slow queries, high memory usage, and Supabase timeouts.
 */
export const DEFAULT_PAGE_SIZE = 100;

export function applyPagination<TQuery extends { range: (from: number, to: number) => TQuery }>(
  query: TQuery,
  pagination: VaultPagination | undefined
): TQuery {
  const limit = pagination?.limit ?? DEFAULT_PAGE_SIZE;
  const from = pagination?.offset ?? 0;
  return query.range(from, from + limit - 1);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { toError };
