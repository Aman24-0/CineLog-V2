// src/features/sync/import/ImportSource.ts
//
// ImportSource — the plugin contract for importing data into CineLog.
//
// ARCHITECTURE:
//   The Sync page is the central hub for all imports. Each import
//   provider (CineLog V1, Letterboxd, Trakt, IMDb, CSV, …) implements
//   this interface. The Sync page renders a card per registered source
//   and delegates the import flow to the source's wizard component.
//
//   New providers can be added by:
//   1. Implementing this interface.
//   2. Registering it in IMPORT_SOURCES below.
//   No changes to the Sync page itself are required.
//
// This is the 5-year architecture: the page never needs to change
// when a new import source lands — the source ships as a self-contained
// plugin.

import type { Component } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

/** The lifecycle stages of an import, used for progress UI. */
export type ImportStage =
  | "idle"
  | "connecting"
  | "reading"
  | "analyzing"
  | "detecting-duplicates"
  | "previewing"
  | "migrating"
  | "finalizing"
  | "complete"
  | "error";

/** A preview of what the import will bring in, shown before the user confirms. */
export interface ImportPreview {
  movies: number;
  series: number;
  ratings: number;
  watchStatuses: number;
  notes: number;
  collections: number;
  /** Titles that already exist in the user's library (will be skipped/merged). */
  duplicates: number;
  /** Total titles the import will actually add (after dedup). */
  total: number;
}

/** The result of a completed import. */
export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  /** Human-readable summary, e.g. "842 titles imported, 12 skipped". */
  summary: string;
}

/** The data an import source produces for each title it reads. */
export interface ImportItem {
  tmdbId?: string;
  title: string;
  mediaType: "movie" | "tv";
  status?: WatchlistItem["status"];
  rating?: number;
  notes?: string;
  watchedAt?: string;
  /** Source-specific collection/folder name, if the title belongs to one. */
  collection?: string;
}

/**
 * ImportSource — the plugin contract.
 *
 * Each method/field is designed so the Sync page can render a card and
 * launch the wizard without knowing anything about the source's internals.
 */
export interface ImportSource {
  /** Stable unique id, e.g. "cinelog-v1", "letterboxd". */
  id: string;
  /** User-facing display name, e.g. "CineLog V1". */
  displayName: string;
  /** Short description shown on the import card. */
  description: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Brand accent color (CSS color), for the card icon tint. */
  accentColor: string;
  /** Whether this source is currently available (false = "coming soon"). */
  available: boolean;
  /** "coming soon" badge text, if !available. */
  comingSoonLabel?: string;

  /**
   * The wizard component that runs the import flow. Receives callbacks
   * for completion and cancellation. The Sync page renders this in a
   * modal/sheet when the user taps the import card.
   */
  Wizard: Component<ImportWizardProps>;
}

export interface ImportWizardProps {
  /** Called when the import completes successfully. */
  onComplete: (result: ImportResult) => void;
  /** Called when the user cancels the wizard. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Registry — the single list of all import sources.
// To add a new source, append it here. The Sync page reads this array.
// ---------------------------------------------------------------------------

import { JsonImportSource } from "./sources/jsonImportSource";

export const IMPORT_SOURCES: ImportSource[] = [
  JsonImportSource,
  // Future sources — registered here when implemented:
  // LetterboxdImportSource,
  // TraktImportSource,
  // CsvImportSource,
];

/**
 * Future-source placeholders. These are NOT registered (not importable
 * yet) but are shown on the Sync page as "Coming soon" cards so users
 * know what's on the roadmap. When a source is implemented, move it
 * from here into IMPORT_SOURCES.
 */
export interface FutureSource {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  accentColor: string;
}

export const FUTURE_SOURCES: FutureSource[] = [
  {
    id: "csv",
    displayName: "CSV File",
    description: "Import from a CSV spreadsheet file",
    icon: "table_chart",
    accentColor: "#22c55e",
  },
  {
    id: "letterboxd",
    displayName: "Letterboxd",
    description: "Import from your Letterboxd diary & watchlist",
    icon: "movie_filter",
    accentColor: "#ff8000",
  },
  {
    id: "trakt",
    displayName: "Trakt",
    description: "Import your Trakt history, ratings & watchlist",
    icon: "tv_gen",
    accentColor: "#ed1c24",
  },
  {
    id: "imdb",
    displayName: "IMDb",
    description: "Import from an exported IMDb watchlist",
    icon: "movie_info",
    accentColor: "#f5c518",
  },
];
