// src/core/config/discoverRegion.ts
//
// discoverRegion — single source of truth for the app's "watch region".
//
// Today the default is "IN". The Account settings page overrides this
// value via `setDiscoverRegion()` when the user picks a country.
//
// CONTRACT:
//   - Every Discover / Upcoming surface MUST read region from
//     `getDiscoverRegion()` (or the reactive `useDiscoverRegion()` hook).
//   - No hardcoded "IN" string outside this file.
//   - Region is a 2-letter ISO 3166-1 code (TMDB watch_region format).
//
// REACTIVITY:
//   The region is now reactive — `setDiscoverRegion()` updates a
//   signal that consumers can read via `useDiscoverRegion()`. This
//   lets the Upcoming page (and any future reactive surface) refresh
//   when the user changes their country in Account settings without
//   requiring a full page reload.

import { createSignal } from "solid-js";

/** Default region. India until user settings override. */
export const DEFAULT_DISCOVER_REGION = "IN" as const;

/**
 * Valid ISO 3166-1 alpha-2 region codes we explicitly support.
 * Mirrors `COUNTRIES` in `shared/data/countryLanguages.ts` but kept
 * here as a thin string array so non-UI code (e.g. the TMDB client)
 * can validate without importing the full UI-facing country list.
 */
export const SUPPORTED_DISCOVER_REGIONS = [
  "IN", "US", "GB", "CA", "AU", "DE", "FR", "JP", "KR", "CN",
  "ES", "IT", "BR", "MX", "RU", "AE", "SA", "TR", "NL", "SE",
] as const;

export type DiscoverRegionCode = (typeof SUPPORTED_DISCOVER_REGIONS)[number];

// Module-level signal — reactive. Created at module top-level is OK
// because we don't alias the getter as a top-level `export const`
// (we export a function that returns the signal's value, which avoids
// the TDZ error documented below).
const [regionSignal, setRegionSignal] = createSignal<string>(DEFAULT_DISCOVER_REGION);

/**
 * Read the current Discover region (non-reactive).
 * Use this in non-reactive contexts (event handlers, fetch builders,
 * SSR). For reactive contexts (component bodies, memos, effects),
 * use `useDiscoverRegion()` instead.
 */
export function getDiscoverRegion(): string {
  return regionSignal();
}

/**
 * Reactive read of the current Discover region. Use this in Solid
 * components / memos / effects so they re-run when the region changes.
 */
export function useDiscoverRegion(): () => string {
  return regionSignal;
}

/**
 * Override the Discover region. Called by the Account settings page
 * when the user picks a country. Validates against the supported list
 * and falls back to the default for unknown codes.
 */
export function setDiscoverRegion(region: string): void {
  const upper = (region || "").toUpperCase();
  const isValid = (SUPPORTED_DISCOVER_REGIONS as readonly string[]).includes(upper);
  setRegionSignal(isValid ? upper : DEFAULT_DISCOVER_REGION);
}
