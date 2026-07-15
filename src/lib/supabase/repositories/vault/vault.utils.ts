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

export function toVaultInsert(payload: CreateVaultItemPayload): VaultInsert {
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
  if (payload.createdAt !== undefined) {
    insert.created_at = payload.createdAt;
  }

  return insert;
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

export function applyPagination<TQuery extends { range: (from: number, to: number) => TQuery }>(
  query: TQuery,
  pagination: VaultPagination | undefined
): TQuery {
  if (!pagination) return query;
  const from = pagination.offset ?? 0;
  return query.range(from, from + pagination.limit - 1);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { toError };
