// src/features/sync/import/sources/jsonImportSource.ts
//
// JsonImportSource — the import plugin for JSON backup files.
//
// This is the primary import source for CineLog V2. It accepts any
// CineLog backup file (.json) in either supported format:
//   - Flat array: [WatchlistItem, ...]  (V1 export format)
//   - Wrapped:    { version, library: { watchlist } }  (V2 format)
//
// The wizard handles file upload, preview, dedup, and import with
// a live progress bar.

import type { Component } from "solid-js";
import type { ImportSource, ImportWizardProps } from "../ImportSource";
import JsonImportWizard from "./JsonImportWizard";

export const JsonImportSource: ImportSource = {
  id: "json-import",
  displayName: "JSON Backup",
  description: "Import from a CineLog backup file (.json)",
  icon: "file_json",
  accentColor: "var(--p)",
  available: true,
  Wizard: JsonImportWizard as Component<ImportWizardProps>
};
