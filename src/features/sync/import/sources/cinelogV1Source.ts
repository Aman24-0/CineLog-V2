// src/features/sync/import/sources/cinelogV1Source.ts
//
// CineLogV1ImportSource — the import plugin for CineLog V1 (Firebase).
//
// V1 stored data in Firebase Firestore under per-user collections.
// This source reads from Firebase using the user's V1 credentials,
// analyzes the library, detects duplicates, previews the import, and
// migrates the data into V2 (Supabase).
//
// The migration is RESUMABLE — progress is persisted to localStorage
// so a network failure or app close doesn't lose progress. The user
// can restart the migration from where it left off.
//
// ARCHITECTURE:
//   cinelogV1Source (this file) — the ImportSource plugin registration
//   ↓
//   V1MigrationWizard — the multi-step UI component
//   ↓
//   cinelogV1Migration — the migration engine (read, analyze, dedupe, write)

import type { Component } from "solid-js";
import type { ImportSource, ImportWizardProps } from "../ImportSource";
import V1MigrationWizard from "./V1MigrationWizard";

export const CineLogV1ImportSource: ImportSource = {
  id: "cinelog-v1",
  displayName: "CineLog V1",
  description: "Migrate your library from the original CineLog app",
  icon: "rocket_launch",
  accentColor: "var(--p)", // CineLog green
  available: true,
  Wizard: V1MigrationWizard as Component<ImportWizardProps>,
};
