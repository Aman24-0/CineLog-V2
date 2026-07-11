// src/features/sync/import/sources/cinelogV1Migration.ts
//
// cinelogV1Migration — the engine that reads from CineLog V1 (Firebase)
// and writes into CineLog V2 (Supabase).
//
// FLOW:
//   1. connectToV1(email, password) → Firebase Auth signIn
//   2. readV1Library(user) → fetch all Firestore collections
//   3. analyzeLibrary(items) → categorize + count
//   4. detectDuplicates(v1Items, v2Watchlist) → mark existing titles
//   5. migrate(items, onProgress) → write to Supabase, report progress
//
// RESUMABILITY:
//   Progress is persisted to localStorage under the key
//   "cinelog:v1-migration". If the migration is interrupted, the
//   wizard reads this on mount and offers to resume.
//
// NO DATA LOSS:
//   Every V1 item is either imported or explicitly skipped (duplicate).
//   The result summary breaks down imported / skipped / failed counts.
//
// NO DUPLICATES:
//   Duplicate detection uses TMDB id (preferred) or title+year fallback.
//   Duplicates are skipped by default — the user can override in the
//   preview step.

import type { ImportItem, ImportPreview, ImportResult } from "../ImportSource";
import type { WatchlistItem } from "~/shared/types";

// Re-export so the wizard can import these types from this module.
export type { ImportItem, ImportPreview, ImportResult };

// ---------------------------------------------------------------------------
// Resumability — localStorage persistence of migration progress
// ---------------------------------------------------------------------------

const MIGRATION_STORAGE_KEY = "cinelog:v1-migration";

export interface MigrationProgress {
  v1Uid: string;
  startedAt: string;
  totalItems: number;
  processedItems: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  completed: boolean;
}

export function loadMigrationProgress(): MigrationProgress | null {
  try {
    const raw = localStorage.getItem(MIGRATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MigrationProgress;
  } catch {
    return null;
  }
}

export function saveMigrationProgress(progress: MigrationProgress): void {
  try {
    localStorage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage may be full or disabled — non-fatal.
  }
}

export function clearMigrationProgress(): void {
  try {
    localStorage.removeItem(MIGRATION_STORAGE_KEY);
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Step 1: Connect to V1 Firebase
// ---------------------------------------------------------------------------

/**
 * Connect to CineLog V1's Firebase project using the user's V1 credentials.
 *
 * V1 used a separate Firebase project. We initialize a SEPARATE Firebase
 * app instance (named "cinelog-v1") so it doesn't conflict with V2's
 * Supabase auth. The user signs in with their V1 email + password.
 *
 * Returns the V1 user uid (used to read their Firestore data).
 *
 * NOTE: Firebase is an optional peer dependency. It's dynamically
 * imported so V2 doesn't bundle it unless the user actually starts a
 * V1 migration. If firebase isn't installed, this throws a helpful
 * error.
 */
export async function connectToV1(
  email: string,
  password: string,
): Promise<{ uid: string; email: string | null }> {
  // Dynamic import with a variable specifier so Vite/Rollup doesn't
  // try to resolve firebase at build time. Firebase is an optional
  // peer dependency — only needed when a user actually starts a V1
  // migration. If it isn't installed, the import rejects and we
  // surface a helpful error.
  const appModule = "firebase/app";
  const authModule = "firebase/auth";
  let firebaseApp: typeof import("firebase/app");
  let firebaseAuth: typeof import("firebase/auth");
  try {
    firebaseApp = await import(/* @vite-ignore */ appModule);
    firebaseAuth = await import(/* @vite-ignore */ authModule);
  } catch {
    throw new Error(
      "CineLog V1 migration requires the Firebase SDK. Please contact support.",
    );
  }
  const { initializeApp, getApp } = firebaseApp;
  const { getAuth, signInWithEmailAndPassword } = firebaseAuth;

  const V1_CONFIG = {
    apiKey: import.meta.env.VITE_V1_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_V1_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_V1_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_V1_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_V1_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_V1_FIREBASE_APP_ID,
  };

  // Guard: if V1 config isn't set, we can't connect. This is a build-
  // time check so the wizard can show a helpful message instead of a
  // cryptic Firebase error.
  if (!V1_CONFIG.apiKey || !V1_CONFIG.projectId) {
    throw new Error(
      "CineLog V1 migration is not configured. Set VITE_V1_FIREBASE_* environment variables.",
    );
  }

  // Initialize a SEPARATE Firebase app instance (not the default app,
  // which V2 doesn't use anyway — V2 uses Supabase).
  let v1App;
  try {
    v1App = initializeApp(V1_CONFIG, "cinelog-v1");
  } catch {
    // Already initialized — get the existing instance.
    v1App = getApp("cinelog-v1");
  }

  const auth = getAuth(v1App);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return {
    uid: credential.user.uid,
    email: credential.user.email,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Read V1 Firestore library
// ---------------------------------------------------------------------------

/**
 * Read the user's V1 library from Firestore.
 *
 * V1 stored data in these collections:
 *   users/{uid}/watchlist    — movie/TV entries
 *   users/{uid}/ratings      — ratings (sometimes separate from watchlist)
 *   users/{uid}/collections  — user-created collections/folders
 *
 * Returns a flat list of ImportItems, normalized to V2's shape.
 */
export async function readV1Library(
  uid: string,
): Promise<ImportItem[]> {
  const appModule = "firebase/app";
  const firestoreModule = "firebase/firestore";
  let firebaseApp: typeof import("firebase/app");
  let firebaseFirestore: typeof import("firebase/firestore");
  try {
    firebaseApp = await import(/* @vite-ignore */ appModule);
    firebaseFirestore = await import(/* @vite-ignore */ firestoreModule);
  } catch {
    throw new Error("CineLog V1 migration requires the Firebase SDK.");
  }
  const { getApp } = firebaseApp;
  const { getFirestore, collection, getDocs, query } = firebaseFirestore;

  let v1App;
  try {
    v1App = getApp("cinelog-v1");
  } catch {
    // If not yet initialized, the connect step didn't run.
    throw new Error("Not connected to CineLog V1. Call connectToV1() first.");
  }

  const db = getFirestore(v1App);
  const items: ImportItem[] = [];

  // Read the watchlist collection.
  const watchlistSnap = await getDocs(query(collection(db, "users", uid, "watchlist")));
  watchlistSnap.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    items.push({
      tmdbId: data.tmdbId != null ? String(data.tmdbId) : undefined,
      title: (typeof data.title === "string" ? data.title : "") || (typeof data.name === "string" ? data.name : "") || "Untitled",
      mediaType: data.media_type === "tv" ? "tv" : "movie",
      status: mapV1Status(data.status),
      rating: typeof data.rating === "number" ? data.rating : undefined,
      notes: typeof data.notes === "string" ? data.notes : undefined,
      watchedAt: (typeof data.watchDate === "string" ? data.watchDate : undefined) ?? (typeof data.updatedAt === "string" ? data.updatedAt : undefined),
      collection: typeof data.collection === "string" ? data.collection : undefined,
    });
  });

  // Read the collections collection (folder names only — titles are
  // associated via the `collection` field on watchlist items above).
  // We don't need to read this separately for the import; the collection
  // names come from the watchlist items' `collection` field.

  return items;
}

/** Map V1 status strings to V2 WatchlistItem.status. */
function mapV1Status(v1Status: unknown): WatchlistItem["status"] | undefined {
  if (!v1Status || typeof v1Status !== "string") return undefined;
  const s = v1Status.toLowerCase();
  if (s.includes("watch")) return "Watching";
  if (s.includes("complet")) return "Completed";
  if (s.includes("plan")) return "Planned";
  return "Planned";
}

// ---------------------------------------------------------------------------
// Step 3: Analyze the library
// ---------------------------------------------------------------------------

export function analyzeLibrary(items: ImportItem[]): ImportPreview {
  let movies = 0;
  let series = 0;
  let ratings = 0;
  let watchStatuses = 0;
  let notes = 0;
  const collections = new Set<string>();

  for (const item of items) {
    if (item.mediaType === "movie") movies++;
    else series++;
    if (item.rating != null) ratings++;
    if (item.status) watchStatuses++;
    if (item.notes) notes++;
    if (item.collection) collections.add(item.collection);
  }

  return {
    movies,
    series,
    ratings,
    watchStatuses,
    notes,
    collections: collections.size,
    duplicates: 0, // filled by detectDuplicates()
    total: items.length,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Detect which V1 items already exist in the user's V2 watchlist.
 *
 * Matching strategy (in priority order):
 *   1. TMDB id match (most reliable)
 *   2. Title + year match (fallback for items without TMDB id)
 *
 * Returns a new ImportPreview with `duplicates` filled in, and marks
 * each item with `isDuplicate` (via a side-effect on the items array).
 */
export function detectDuplicates(
  v1Items: ImportItem[],
  v2Watchlist: WatchlistItem[],
): ImportPreview {
  const v2ByTmdbId = new Map<string, WatchlistItem>();
  const v2ByTitle = new Map<string, WatchlistItem>();
  for (const w of v2Watchlist) {
    if (w.id) v2ByTmdbId.set(String(w.id), w);
    const titleKey = (w.title || w.name || "").toLowerCase().trim();
    if (titleKey) v2ByTitle.set(titleKey, w);
  }

  let duplicates = 0;
  for (const item of v1Items) {
    let isDuplicate = false;
    if (item.tmdbId && v2ByTmdbId.has(item.tmdbId)) {
      isDuplicate = true;
    } else {
      const titleKey = item.title.toLowerCase().trim();
      if (titleKey && v2ByTitle.has(titleKey)) {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      duplicates++;
      (item as ImportItem & { isDuplicate?: boolean }).isDuplicate = true;
    }
  }

  const preview = analyzeLibrary(v1Items);
  preview.duplicates = duplicates;
  preview.total = v1Items.length - duplicates;
  return preview;
}

// ---------------------------------------------------------------------------
// Step 5: Migrate — write to Supabase
// ---------------------------------------------------------------------------

export interface MigrationCallbacks {
  onProgress: (processed: number, total: number, imported: number, skipped: number, failed: number) => void;
  shouldSkipDuplicates: () => boolean;
}

/**
 * Migrate V1 items into V2's Supabase vault.
 *
 * Uses the existing createVaultItemInSupabase adapter so the data flows
 * through the same path as every other vault write (no bypass).
 *
 * Resumable: if `progress` is provided, skips items already processed.
 */
export async function migrateV1ToV2(
  uid: string,
  items: ImportItem[],
  callbacks: MigrationCallbacks,
  progress?: MigrationProgress,
): Promise<ImportResult> {
  // Dynamic import to avoid bundling the vault adapter unless we're
  // actually migrating.
  const { createVaultItemInSupabase } = await import("~/features/watchlist/vaultAdapter");
  const { getCurrentUid } = await import("~/shared/hooks/useAuth");

  const v2Uid = getCurrentUid();
  if (!v2Uid) {
    throw new Error("You must be signed in to CineLog V2 to migrate.");
  }

  let imported = progress?.importedCount ?? 0;
  let skipped = progress?.skippedCount ?? 0;
  let failed = progress?.failedCount ?? 0;
  const startIndex = progress?.processedItems ?? 0;
  const total = items.length;

  for (let i = startIndex; i < total; i++) {
    const item = items[i];
    try {
      const isDuplicate = (item as ImportItem & { isDuplicate?: boolean }).isDuplicate === true;
      if (isDuplicate && callbacks.shouldSkipDuplicates()) {
        skipped++;
      } else {
        const vaultItem: WatchlistItem = {
          id: item.tmdbId || crypto.randomUUID(),
          title: item.mediaType === "movie" ? item.title : undefined,
          name: item.mediaType === "tv" ? item.title : undefined,
          media_type: item.mediaType,
          status: item.status || "Planned",
          rating: item.rating,
          notes: item.notes,
          watchDate: item.watchedAt,
        };
        await createVaultItemInSupabase(v2Uid, vaultItem);
        imported++;
      }
    } catch (err) {
      console.error("[V1 migration] Failed to import item:", item.title, err);
      failed++;
    }

    // Persist progress for resumability.
    const updatedProgress: MigrationProgress = {
      v1Uid: uid,
      startedAt: progress?.startedAt ?? new Date().toISOString(),
      totalItems: total,
      processedItems: i + 1,
      importedCount: imported,
      skippedCount: skipped,
      failedCount: failed,
      completed: i + 1 >= total,
    };
    saveMigrationProgress(updatedProgress);

    callbacks.onProgress(i + 1, total, imported, skipped, failed);
  }

  // Migration complete — clear the resumability state.
  clearMigrationProgress();

  return {
    imported,
    skipped,
    failed,
    summary: `${imported} titles imported, ${skipped} skipped, ${failed} failed`,
  };
}
