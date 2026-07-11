// src/core/config/discoverRegion.ts
//
// discoverRegion — single source of truth for the Discover page's region.
//
// Today the default is "IN". In the future, user settings will override
// this value (e.g. via a Settings → Region selector backed by Supabase
// profile row). When that lands, only this module needs to change — every
// Discover hook, component, and TMDB call already consumes `discoverRegion`
// rather than a hardcoded "IN" literal.
//
// CONTRACT:
//   - Every Discover surface MUST read region from `getDiscoverRegion()`
//     or accept it as a prop threaded from the DiscoverPage root.
//   - No hardcoded "IN" string outside this file.
//   - Region is a 2-letter ISO 3166-1 code (TMDB watch_region format).
//
// Future migration path (NOT implemented yet — feature freeze):
//   1. Add `discover_region` column to the profiles table.
//   2. On login, hydrate `setDiscoverRegion(profile.discover_region)`.
//   3. Settings page exposes a region picker that writes to Supabase
//      and calls `setDiscoverRegion()` on save.
//   4. The Discover page re-renders automatically (region is a signal).

import { createSignal } from "solid-js";

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

const [discoverRegionSignal, setDiscoverRegionSignal] =
  createSignal<string>(DEFAULT_DISCOVER_REGION);

/**
 * Read the current Discover region. Reactive — components that consume
 * this signal re-render when the region changes (e.g. user picks a new
 * region in Settings).
 */
export const getDiscoverRegion = discoverRegionSignal;

/**
 * Override the Discover region. Called by the future Settings page
 * (and by tests). Validates against the supported list and falls back
 * to the default for unknown codes.
 */
export function setDiscoverRegion(region: string): void {
  const upper = (region || "").toUpperCase();
  const isValid = (SUPPORTED_DISCOVER_REGIONS as readonly string[]).includes(upper);
  setDiscoverRegionSignal(isValid ? upper : DEFAULT_DISCOVER_REGION);
}
