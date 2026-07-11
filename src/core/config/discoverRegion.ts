// src/core/config/discoverRegion.ts
//
// discoverRegion — single source of truth for the Discover page's region.
//
// Today the default is "IN". In the future, user settings will override
// this value (e.g. via a Settings → Region selector backed by Supabase
// profile row).
//
// CONTRACT:
//   - Every Discover surface MUST read region from `getDiscoverRegion()`
//     or accept it as a prop threaded from the DiscoverPage root.
//   - No hardcoded "IN" string outside this file.
//   - Region is a 2-letter ISO 3166-1 code (TMDB watch_region format).
//
// IMPLEMENTATION NOTE:
//   This module deliberately does NOT call `createSignal()` at module
//   top-level. Doing so caused a "Cannot access 'M' before initialization"
//   TDZ error at runtime — `createSignal` is a solid-js export, and
//   aliasing its returned getter as a top-level `export const` meant any
//   importer that triggered circular module evaluation could read the
//   getter before the `const` had been initialized. The minifier (esbuild)
//   renamed the inner binding to `M`, producing the cryptic error.
//
//   Region does not need reactivity today — the Settings page that would
//   override it does not exist yet. We use a plain mutable variable. When
//   Settings lands, it can either (a) reload the page after writing to
//   Supabase, or (b) introduce a proper reactive context here (created
//   inside a component, not at module top-level).

/** Default region for Discover. India until user settings override. */
export const DEFAULT_DISCOVER_REGION = "IN" as const;

/** Valid ISO 3166-1 alpha-2 region codes we explicitly support. */
export const SUPPORTED_DISCOVER_REGIONS = [
  "IN", // India
  "US", // United States
  "GB", // United Kingdom
  "CA", // Canada
  "AU", // Australia
] as const;

export type DiscoverRegionCode = (typeof SUPPORTED_DISCOVER_REGIONS)[number];

/**
 * The current Discover region. Plain mutable — NOT reactive.
 * Read via `getDiscoverRegion()`, write via `setDiscoverRegion()`.
 *
 * Defaults to "IN". When the future Settings page changes this, it
 * should call `setDiscoverRegion()` and then navigate/reload so every
 * Discover section re-fetches with the new region.
 */
let currentRegion: string = DEFAULT_DISCOVER_REGION;

/**
 * Read the current Discover region.
 *
 * Not reactive today — returns the current value. Callers that need
 * to re-fetch when the region changes (e.g. DiscoverPage) should
 * re-read this on mount / navigation, which they already do.
 */
export function getDiscoverRegion(): string {
  return currentRegion;
}

/**
 * Override the Discover region. Called by the future Settings page
 * (and by tests). Validates against the supported list and falls back
 * to the default for unknown codes.
 */
export function setDiscoverRegion(region: string): void {
  const upper = (region || "").toUpperCase();
  const isValid = (SUPPORTED_DISCOVER_REGIONS as readonly string[]).includes(upper);
  currentRegion = isValid ? upper : DEFAULT_DISCOVER_REGION;
}
