// src/features/sync/backup/types.ts
//
// Pure type definitions for the backup/restore pipeline.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so that types can be
// imported by other modules without pulling in the full service (which
// imports Supabase repositories, the vault adapter, and the auth hook).
//
// All consumer-facing types live here. The BackupService.ts file remains
// the public facade — it re-exports these types so existing imports
// (`import { type ParsedBackup } from "./BackupService"`) keep working.

import type { WatchlistItem } from "~/shared/types";
import type { BackupFormat } from "./normalizeBackup";

// ---------------------------------------------------------------------------
// Wrapped V2 backup document + sub-types
// ---------------------------------------------------------------------------

/**
 * Wrapped V2 backup document.
 *
 * This is the shape we WRITE when exporting — `exportBackup()` serializes
 * a `BackupDocument` to JSON and triggers a browser download. The parser
 * in `normalizeBackup.ts` recognizes this shape as the "wrapped-v2" format.
 */
export interface BackupDocument {
  version: 1;
  createdAt: string;
  appVersion: string;
  library: {
    watchlist: WatchlistItem[];
    /**
     * Collections + their entries. Phase 1 audit fix — previously
     * hardcoded to `[]`, so exports lost all collection data.
     */
    collections?: BackupCollection[];
    /**
     * Saved vault-filter presets. Phase 1 audit fix.
     */
    presets?: BackupPreset[];
    /**
     * Episode-level watch progress for TV items. Phase 1 audit fix.
     * Keyed by vault_id so the restore can match progress to the
     * re-imported vault row.
     */
    episodeProgress?: BackupEpisodeProgress[];
  };
}

/**
 * A collection + its entries, exported as part of a backup.
 *
 * We snapshot entries by their tmdb_id + media_type (not vault_id)
 * because vault_id will be different on the restore side (the
 * restored vault row gets a fresh UUID). The restore flow matches
 * entries to the new vault row by (tmdb_id, media_type).
 */
export interface BackupCollection {
  name: string;
  description: string | null;
  collection_type: string;
  poster_url: string | null;
  is_public: boolean;
  archived_at: string | null;
  // Entries — each references a watchlist item by tmdb_id + media_type
  entries: BackupCollectionEntry[];
}

export interface BackupCollectionEntry {
  tmdb_id: string;
  media_type: "movie" | "tv";
  position: number;
  note: string | null;
  added_at: string;
}

export interface BackupPreset {
  name: string;
  filters: unknown;
}

export interface BackupEpisodeProgress {
  // The vault_id of the original item — used to look up the matching
  // tmdb_id + media_type in the watchlist, then re-attached to the
  // restored vault row.
  vault_id: string;
  season: number | null;
  episode: number | null;
  is_completed: boolean;
  progress_minutes: number | null;
  watched_at: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Parsed backup + preview + restore result
// ---------------------------------------------------------------------------

/** A parsed backup — normalized to a flat watchlist regardless of input format. */
export interface ParsedBackup {
  /** The normalized, valid items ready for import. */
  items: WatchlistItem[];
  /** Which format was detected. */
  format: BackupFormat;
  /** Items that failed validation (with reasons). */
  failures: { reason: string; item: unknown }[];
  /** Count of items that were repaired (missing fields filled in). */
  repairedCount: number;
  /** The original wrapped document, if format is "wrapped-v2". */
  document?: BackupDocument;
}

export interface BackupPreview {
  titles: number;
  movies: number;
  series: number;
  ratings: number;
  notes: number;
  completed: number;
  watching: number;
  planned: number;
  collections: number;
  /** Titles that already exist in the user's library (will be skipped). */
  duplicates: number;
  /** Total titles that will actually be added (after dedup). */
  willImport: number;
  /** Items that were repaired during normalization. */
  repaired: number;
  /** Items that failed validation and will be skipped. */
  failed: number;
}

export interface RestoreResult {
  imported: number;
  skipped: number;
  failed: number;
  repaired: number;
  duplicates: number;
  summary: string;
  /** Per-failure reasons for logging/debugging. */
  failureLog: { reason: string; title?: string }[];
}

export interface RestoreCallbacks {
  onProgress: (
    processed: number,
    total: number,
    imported: number,
    skipped: number,
    failed: number
  ) => void;
  /** Optional: called when the user cancels — the loop stops after the current item. */
  shouldCancel?: () => boolean;
}

// ---------------------------------------------------------------------------
// BackupStrategy — plugin contract for different backup types
// ---------------------------------------------------------------------------

export interface BackupStrategy {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  available: boolean;
  comingSoonLabel?: string;
}
