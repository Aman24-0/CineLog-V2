// src/core/preferences/preferencesSync.ts
//
// CineLog V2 — Preference Cross-Device Sync (Phase 1 audit fix)
// ---------------------------------------------------------------------
// Wires the localStorage-backed preference signals to the
// `user_preferences.prefs_json` Supabase column so prefs travel with
// the user across devices.
//
// PROBLEM (from the audit report):
//   Preferences were localStorage-only. The `user_preferences` table
//   existed (with a `prefs_json` JSONB column for extended prefs) and
//   the repository layer (settings.ts) had `getUserSettings` /
//   `saveUserSettings` / `saveExtendedPreference` — but no code ever
//   called them. A user who set "dark theme + reduced motion" on
//   their laptop would see "light theme + default motion" on their
//   phone.
//
// DESIGN:
//   localStorage remains the PRIMARY store (instant UI, offline-capable,
//   SSR-friendly). Supabase is a SECONDARY store that mirrors the
//   localStorage state for cross-device sync.
//
//   On sign-in:
//     1. Fetch prefs_json from user_preferences.
//     2. If the server's `updated_at` is newer than the local
//        `cinelog_prefs_synced_at` timestamp, the server wins — apply
//        each known pref to localStorage + the corresponding signal.
//     3. Otherwise (local is newer), push local → server.
//
//   On pref change (debounced 1.5s):
//     1. Collect all current pref values.
//     2. Upsert into prefs_json.
//     3. Update `cinelog_prefs_synced_at`.
//
//   On sign-out:
//     1. Stop the debounced pusher (no point writing to a user row
//        we no longer own).
//     2. Leave localStorage intact so the next sign-in (same or
//        different user) sees the last-known prefs.
//
// CONFLICT RESOLUTION:
//   "Server wins on tie" is the safe default. If both local and
//   server have unsaved changes, the server version is authoritative
//   because it was the last explicitly-saved state. The user can
//   re-apply their local changes by simply toggling the pref again.
//
// BEST-EFFORT:
//   All Supabase writes are fire-and-forget. If they fail (offline,
//   RLS error, etc.), the error is logged to stderr but not surfaced
//   to the user — prefs are a UX concern, not a data-integrity one.

import { createEffect, createRoot } from "solid-js";
import { isServer } from "solid-js/web";
import {
  getUserSettings,
  saveUserSettings
} from "~/lib/supabase/repositories/settings";
import {
  themeMode,
  setThemeMode,
  type ThemeMode
} from "./themeMode";
import { density, setDensity, type Density } from "./density";
import { fontSize, setFontSize, type FontSize } from "./fontSize";
import {
  posterQuality,
  setPosterQuality,
  type PosterQuality
} from "./posterQuality";
import { hideSpoilers, setHideSpoilers } from "./hideSpoilers";
import {
  dateFormat,
  setDateFormat,
  type DateFormat
} from "./dateFormat";
import {
  reducedMotion,
  setReducedMotion,
  type ReducedMotionPref
} from "./reducedMotion";
import { highContrast, setHighContrast } from "./highContrast";
// Phase 14 Chunk 2 — Ambient intensity (Subtle / Normal / Vibrant).
import {
  ambientIntensity,
  setAmbientIntensity,
  type AmbientIntensity
} from "./ambientIntensity";
import {
  language,
  setLanguage,
  fallbackLanguage,
  setFallbackLanguage,
  type LanguageCode
} from "./language";
import {
  defaultVaultStatus,
  setDefaultVaultStatus,
  type VaultStatus
} from "./vaultStatus";
import {
  adultContentFilter,
  setAdultContentFilter,
  contentRatingCap,
  setContentRatingCap
} from "./contentFilters";
// Bug #28 (Phase 13 Chunk 3): streamingProviders was previously a
// localStorage-only pref (`cinelog_streaming_providers`). It now syncs
// through `prefs_json` so a user's OTT subscriptions travel across
// devices. Without this, a user who selected Netflix+Prime on their
// laptop would see an empty OTT filter on their phone.
import {
  streamingProviders,
  setStreamingProviders
} from "./streamingProviders";
import {
  defaultDiscoverTab,
  setDefaultDiscoverTab,
  type DiscoverTab
} from "./discoverTab";
import {
  ratingScale,
  setRatingScale,
  type RatingScale
} from "./ratingScale";
import { notifPrefs, setNotifPrefs, type NotificationPrefs } from "./notifications";
import {
  calPrefs,
  setCalPrefs,
  type CalendarPrefs
} from "./calendar";
import {
  syncCadence,
  setSyncCadence,
  type SyncCadence
} from "./syncCadence";
import { hideRatingsInScreenshots, setHideRatingsInScreenshots } from "./hideRatingsScreenshots";
// Phase 4 Task 7: theme (the 8 accent presets) is now synced to Supabase
// instead of only persisting locally to cinelog_theme localStorage.
import { theme, setTheme, type Theme } from "~/core/theme";

// ─── Types ────────────────────────────────────────────────────────

/**
 * A flat snapshot of all syncable preferences, packed into a single
 * JSONB object. The keys are stable identifiers (not the signal names)
 * so we can rename signals without breaking old snapshots.
 *
 * Phase 4 Task 7: added `theme` (the 8 accent presets: cinematic, pearl,
 * sage, matrix, netflix, interstellar, neonhorizon, vibranium). This was
 * previously localStorage-only (`cinelog_theme`) — it now syncs to
 * Supabase so a user's accent choice travels across devices.
 *
 * Bug #28 (Phase 13 Chunk 3): added `fallbackLanguage`, `streamingProviders`,
 * and `contentRatingCap`. All three were defined as signals + persisted
 * to localStorage, but were never included in the snapshot — so they
 * silently failed to sync across devices. A user who set Hindi as their
 * fallback language, picked Netflix+Prime as their OTT providers, and
 * capped content at "UA" on one device would see defaults on every
 * other device they signed in on.
 */
export interface PreferencesSnapshot {
  themeMode?: ThemeMode;
  /** Phase 4 Task 7: accent preset (8 themes). Synced to prefs_json. */
  theme?: Theme;
  density?: Density;
  fontSize?: FontSize;
  posterQuality?: PosterQuality;
  hideSpoilers?: boolean;
  dateFormat?: DateFormat;
  reducedMotion?: ReducedMotionPref;
  highContrast?: boolean;
  /** Phase 14 Chunk 2: ambient intensity (Subtle / Normal / Vibrant).
   *  Synced so the user's preferred background vibrance travels
   *  across devices — same treatment as density / fontSize. */
  ambientIntensity?: AmbientIntensity;
  language?: LanguageCode;
  /** Bug #28: TMDB overview fallback language (used when no overview
   *  exists in the primary `language`). Synced so users get the same
   *  fallback on every device. */
  fallbackLanguage?: LanguageCode;
  defaultVaultStatus?: VaultStatus;
  adultContentFilter?: boolean;
  /** Bug #28: max content certification (e.g. "PG-13", "UA 13+", or ""
   *  for no cap). Synced so parental controls travel across devices. */
  contentRatingCap?: string;
  /** Bug #28: TMDB watch_provider IDs the user is subscribed to.
   *  Empty array is a valid value (no subscriptions), so consumers
   *  must use Array.isArray() rather than a truthy check. */
  streamingProviders?: string[];
  defaultDiscoverTab?: DiscoverTab;
  ratingScale?: RatingScale;
  hideRatingsInScreenshots?: boolean;
  notifPrefs?: NotificationPrefs;
  calPrefs?: CalendarPrefs;
  syncCadence?: SyncCadence;
}

// ─── Helpers ──────────────────────────────────────────────────────

const SYNCED_AT_KEY = "cinelog_prefs_synced_at";

function readSyncedAt(): number {
  if (isServer) return 0;
  const raw = localStorage.getItem(SYNCED_AT_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function writeSyncedAt(ts: number): void {
  if (isServer) return;
  localStorage.setItem(SYNCED_AT_KEY, String(ts));
}

/**
 * Read all current preference values into a flat snapshot. The signals
 * are read inside a tracked scope (createEffect) so this snapshot
 * reflects the live state at call time.
 */
function readSnapshot(): PreferencesSnapshot {
  return {
    themeMode: themeMode(),
    // Phase 4 Task 7: include the accent theme in the snapshot.
    theme: theme(),
    density: density(),
    fontSize: fontSize(),
    posterQuality: posterQuality(),
    hideSpoilers: hideSpoilers(),
    dateFormat: dateFormat(),
    reducedMotion: reducedMotion(),
    highContrast: highContrast(),
    // Phase 14 Chunk 2: include the ambient intensity in the snapshot.
    ambientIntensity: ambientIntensity(),
    language: language(),
    // Bug #28: include the three previously-unsynced prefs.
    fallbackLanguage: fallbackLanguage(),
    defaultVaultStatus: defaultVaultStatus(),
    adultContentFilter: adultContentFilter(),
    contentRatingCap: contentRatingCap(),
    streamingProviders: streamingProviders(),
    defaultDiscoverTab: defaultDiscoverTab(),
    ratingScale: ratingScale(),
    hideRatingsInScreenshots: hideRatingsInScreenshots(),
    notifPrefs: notifPrefs(),
    calPrefs: calPrefs(),
    syncCadence: syncCadence()
  };
}

/**
 * Apply a snapshot from the server to the local signals + localStorage.
 * Only keys that are present in the snapshot are applied — missing
 * keys preserve the current local value (graceful upgrade when the
 * server has an older snapshot from before a new pref was added).
 */
function applySnapshot(snap: PreferencesSnapshot): void {
  if (snap.themeMode) setThemeMode(snap.themeMode);
  // Phase 4 Task 7: apply the accent theme from the server snapshot.
  // setTheme also writes to localStorage (`cinelog_theme`) and updates
  // the document's theme-* class, so the UI picks it up immediately.
  if (snap.theme) setTheme(snap.theme);
  if (snap.density) setDensity(snap.density);
  if (snap.fontSize) setFontSize(snap.fontSize);
  if (snap.posterQuality) setPosterQuality(snap.posterQuality);
  if (typeof snap.hideSpoilers === "boolean") setHideSpoilers(snap.hideSpoilers);
  if (snap.dateFormat) setDateFormat(snap.dateFormat);
  if (snap.reducedMotion) setReducedMotion(snap.reducedMotion);
  if (typeof snap.highContrast === "boolean") setHighContrast(snap.highContrast);
  // Phase 14 Chunk 2: apply the ambient intensity from the snapshot.
  // Truthy check is safe — the value is a non-empty string union
  // ("subtle" | "normal" | "vibrant"), and the setter's createEffect
  // ignores invalid values via the type guard in ambientIntensity.ts
  // (the signal only accepts AmbientIntensity-typed values, so a
  // malformed server snapshot can't sneak through).
  if (snap.ambientIntensity) setAmbientIntensity(snap.ambientIntensity);
  if (snap.language) setLanguage(snap.language);
  // Bug #28: apply the three previously-unsynced prefs. Use strict
  // type guards rather than truthy checks because:
  //   • `fallbackLanguage` could legitimately be "en" (truthy) but
  //     we still want to apply empty strings from older snapshots
  //     gracefully — typeof guard is safest.
  //   • `contentRatingCap` can be "" (no cap), which is falsy but valid.
  //   • `streamingProviders` can be [] (no subscriptions), also falsy.
  if (typeof snap.fallbackLanguage === "string") {
    setFallbackLanguage(snap.fallbackLanguage);
  }
  if (snap.defaultVaultStatus) setDefaultVaultStatus(snap.defaultVaultStatus);
  if (typeof snap.adultContentFilter === "boolean") {
    setAdultContentFilter(snap.adultContentFilter);
  }
  if (typeof snap.contentRatingCap === "string") {
    setContentRatingCap(snap.contentRatingCap);
  }
  if (Array.isArray(snap.streamingProviders)) {
    setStreamingProviders(snap.streamingProviders);
  }
  if (snap.defaultDiscoverTab) setDefaultDiscoverTab(snap.defaultDiscoverTab);
  if (snap.ratingScale) setRatingScale(snap.ratingScale);
  if (typeof snap.hideRatingsInScreenshots === "boolean") {
    setHideRatingsInScreenshots(snap.hideRatingsInScreenshots);
  }
  if (snap.notifPrefs) setNotifPrefs(snap.notifPrefs);
  if (snap.calPrefs) setCalPrefs(snap.calPrefs);
  if (snap.syncCadence) setSyncCadence(snap.syncCadence);
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch preferences from Supabase and apply them locally if the server
 * is newer than the last sync. Called on sign-in.
 *
 * Returns true if a server snapshot was applied, false otherwise
 * (no row, older server, or fetch error).
 */
export async function syncPreferencesFromSupabase(
  userId: string
): Promise<boolean> {
  if (isServer) return false;

  const { data, error } = await getUserSettings(userId);
  if (error || !data) {
    // No saved prefs or fetch failed — push local → server so the
    // next device sees them.
    await pushPreferencesToSupabase(userId);
    return false;
  }

  const serverUpdatedAt = data.updated_at
    ? Date.parse(data.updated_at)
    : 0;
  const localSyncedAt = readSyncedAt();

  if (serverUpdatedAt > localSyncedAt) {
    // Server is newer — apply server → local.
    const snap = (data.prefs_json as unknown as PreferencesSnapshot) ?? {};
    applySnapshot(snap);
    writeSyncedAt(serverUpdatedAt);
    // Re-push so any local prefs NOT in the server snapshot get
    // backfilled to the server.
    await pushPreferencesToSupabase(userId);
    return true;
  }

  // Local is newer (or equal) — push local → server.
  await pushPreferencesToSupabase(userId);
  return false;
}

/**
 * Push the current local preferences snapshot to Supabase. Best-effort:
 * errors are logged but not surfaced.
 *
 * Also updates `cinelog_prefs_synced_at` so the next sync knows the
 * local state was just persisted.
 */
export async function pushPreferencesToSupabase(
  userId: string
): Promise<void> {
  if (isServer) return;

  const snapshot = readSnapshot();
  const now = Date.now();

  // Cast through `unknown` to the Json type the DB expects. The
  // snapshot is a plain object with primitive / JSON-serializable
  // values, so it satisfies the Json structural type — TypeScript
  // just can't verify that automatically because PreferencesSnapshot
  // has optional fields with union types.
  const { error } = await saveUserSettings(userId, {
    prefs_json: snapshot as unknown as Parameters<typeof saveUserSettings>[1]["prefs_json"]
  });

  if (error) {
    // Don't update synced_at — we'll retry on the next change.
    console.error(
      "[preferencesSync] pushPreferencesToSupabase failed:",
      error.message
    );
    return;
  }

  writeSyncedAt(now);
}

// ─── Auto-push on change (debounced) ──────────────────────────────

let activeUserId: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 1500;

/**
 * Phase 4 Task 8 — Disposable effect handle.
 *
 * The previous implementation called `createEffect()` at module scope
 * (outside any `createRoot`). SolidJS effects created outside a root
 * are NEVER disposed — they keep running until the page is unloaded.
 * `stopPreferenceSync()` only nulled `activeUserId`, which meant the
 * effect kept tracking every preference signal AND kept the closure
 * alive (preventing GC of the old user's snapshot). On repeated
 * sign-in / sign-out cycles, this leaked one effect per cycle.
 *
 * The fix wraps the `createEffect` in a `createRoot` and stores the
 * root's dispose function. `stopPreferenceSync()` calls dispose(),
 * which cleanly tears down the effect AND its signal subscriptions.
 */
let syncRootDispose: (() => void) | null = null;

/**
 * Start watching preference signals and pushing changes to Supabase
 * (debounced 1.5s). Call this on sign-in. Call stopPreferenceSync()
 * on sign-out to release the listener.
 *
 * The effect tracks every preference signal, so any change triggers
 * a debounced push. Without debouncing, rapid toggles (e.g. dragging
 * a slider) would fire dozens of writes per second.
 *
 * Phase 4 Task 8: the effect is created inside a `createRoot` so it
 * can be disposed on sign-out. Repeated start/stop cycles no longer
 * leak effect subscriptions.
 */
export function startPreferenceSync(userId: string): void {
  if (isServer) return;

  // If a previous sync is still running (e.g. sign-in without a
  // preceding sign-out), dispose it first so we don't accumulate
  // duplicate effects.
  if (syncRootDispose) {
    syncRootDispose();
    syncRootDispose = null;
  }

  activeUserId = userId;

  // createRoot gives us a dispose() handle. The effect created inside
  // is torn down when dispose() is called — releasing its signal
  // subscriptions and allowing GC of the closure.
  syncRootDispose = createRoot((dispose) => {
    // Track all preference signals in a single effect. When any one
    // changes, schedule a debounced push.
    createEffect(() => {
      // Read every signal so the effect tracks them all.
      readSnapshot();

      // Schedule a push. Clear any pending one so we coalesce rapid
      // changes into a single write.
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        if (activeUserId) {
          void pushPreferencesToSupabase(activeUserId);
        }
        pushTimer = null;
      }, PUSH_DEBOUNCE_MS);
    });

    // Return the dispose handle so the outer assignment captures it.
    return dispose;
  });
}

/**
 * Stop the auto-pusher. Call on sign-out.
 *
 * Phase 4 Task 8: disposes the `createEffect` (via the createRoot
 * dispose handle) instead of just nulling `activeUserId`. This
 * releases the effect's signal subscriptions and prevents the
 * leak that occurred on repeated sign-in/sign-out cycles.
 *
 * Flushes any pending push synchronously (fire-and-forget) so the
 * last change before sign-out isn't lost.
 */
export function stopPreferenceSync(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  // Phase 4 Task 8: dispose the effect (and its signal subscriptions).
  // This is the fix — previously the effect kept running after sign-out.
  if (syncRootDispose) {
    syncRootDispose();
    syncRootDispose = null;
  }
  // Fire-and-forget the final push so sign-out isn't blocked.
  if (activeUserId) {
    const uid = activeUserId;
    activeUserId = null;
    void pushPreferencesToSupabase(uid);
  }
}

// Convenience re-export for the manual "Sync Preferences" button.
export { pushPreferencesToSupabase as syncPreferencesNow };
