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
    return new Error(
      `[VaultRepository] rating must be between 0.5 and 10 (received ${rating}).`
    );
  }
  return null;
}

export function validateProgressMinutes(minutes: number): Error | null {
  if (minutes < 0) {
    return new Error(
      `[VaultRepository] progressMinutes must be >= 0 (received ${minutes}).`
    );
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
  options?: { includeExtendedFields?: boolean }
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
    last_activity_at: payload.lastActivityAt
  };

  // Extended fields (v2.2 / v2.3) — only set when provided so we don't
  // clobber DB defaults with null on partial inserts.
  if (includeExtended) {
    if (payload.rewatchDates !== undefined) {
      insert.rewatch_dates = payload.rewatchDates;
    }
    if (payload.seasonDates !== undefined) {
      insert.season_dates =
        payload.seasonDates as unknown as import("../../database.types").Json;
    }
    if (payload.seasonRewatchCount !== undefined) {
      insert.season_rewatch_count = payload.seasonRewatchCount;
    }
    if (payload.seasonRewatchDates !== undefined) {
      insert.season_rewatch_dates =
        payload.seasonRewatchDates as unknown as import("../../database.types").Json;
    }
  }
  if (payload.createdAt !== undefined) {
    insert.created_at = payload.createdAt;
  }

  // Tag (Phase 6.2 Task 1a) — only set when provided so we don't clobber
  // existing tag values with null on partial inserts. `null` is a valid
  // explicit value (clears the tag), so we use `undefined !==` rather
  // than a truthiness check.
  if (payload.tag !== undefined) {
    insert.tag = payload.tag;
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
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { message?: string; code?: string; details?: unknown };
  const msg = String(e?.message ?? "").toLowerCase();
  const code = String(e?.code ?? "").toLowerCase();
  const details = typeof e?.details === "string" ? e.details.toLowerCase() : "";

  // Specific PostgreSQL SQLSTATE for undefined column.
  if (code === "42703" || code === "pgrst204") return true;

  // Message must mention "column" AND "does not exist" together — this
  // distinguishes "column X does not exist" (missing column) from
  // "relation X does not exist" (missing table).
  if (msg.includes("column") && msg.includes("does not exist")) return true;
  if (details.includes("column") && details.includes("does not exist"))
    return true;

  // PostgREST "Could not find the column" message.
  if (
    msg.includes("could not find the column") ||
    details.includes("could not find the column")
  )
    return true;

  return false;
}

// ---------------------------------------------------------------------------
// Sort + pagination composition
// ---------------------------------------------------------------------------

export function applySort<
  TQuery extends {
    order: (column: string, opts?: { ascending?: boolean }) => TQuery;
  }
>(query: TQuery, sort: VaultSort | undefined): TQuery {
  if (!sort) return query;
  return query.order(sort.field, { ascending: sort.direction !== "desc" });
}

export function applyPagination<
  TQuery extends { range: (from: number, to: number) => TQuery }
>(query: TQuery, pagination: VaultPagination | undefined): TQuery {
  if (!pagination) return query;
  const from = pagination.offset ?? 0;
  return query.range(from, from + pagination.limit - 1);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { toError };
