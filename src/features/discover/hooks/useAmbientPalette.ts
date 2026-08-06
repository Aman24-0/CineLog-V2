// src/features/discover/hooks/useAmbientPalette.ts
//
// Phase 14 — Ambient Cinematic UI Redesign (Chunk 1: The Ambient Engine)
// ─────────────────────────────────────────────────────────────────────
// Reactive color extraction for the AmbientBackground.
//
// WHAT IT DOES
//   Watches a Spotlight pick (Accessor<SpotlightPick | null>) and, when
//   the pick's backdrop URL changes, extracts a 3-color palette from
//   the backdrop image via the existing colorExtractor utility. The
//   palette is pushed to three CSS variables on document.documentElement:
//     --ambient-color-1  (primary accent — usually the most vibrant hue)
//     --ambient-color-2  (secondary accent — a complementary hue)
//     --ambient-color-3  (tertiary accent — the "base" hue)
//   The AmbientBackground blobs read these variables and morph to the
//   new colors over 1.5s via `transition: background` (see
//   ambient-background.css). The result: when the Spotlight movie
//   changes (user shuffles, or the daily rotation fires), the entire
//   app background smoothly shifts to match the new movie's palette.
//
// PERFORMANCE
//   • Palette extraction runs ONCE per backdrop URL change — not per
//     render. The createEffect is reactive on spotlightPick(), and
//     SolidJS effects only re-run when their tracked signals change.
//   • A module-level Map<string, string[]> caches palettes by URL —
//     if the user shuffles back to a previously-seen movie, the cached
//     palette is reused without re-running the canvas extraction.
//   • The extraction itself uses a 96×96 sample grid (~9K pixels) and
//     takes ~5-15ms on a modern device. It runs in microtask after the
//     image loads, so it doesn't block the Spotlight crossfade.
//   • The CSS variables are written via
//     document.documentElement.style.setProperty — direct DOM write,
//     no React/Solid re-render needed. The browser's CSS engine handles
//     the transition.
//
// SSR SAFETY
//   All DOM access is guarded by `typeof document !== "undefined"`.
//   On the server, the effect is a no-op — the AmbientBackground's
//   default --ambient-color-* values (cinema gold + warm orange + cool
//   blue) are used until the client hydrates and the Spotlight pick
//   resolves.
//
// FAILURE MODES
//   If extraction fails (CORS, 404, timeout, tainted canvas), the
//   colorExtractor returns an array of 3 FALLBACK_COLOR values. We
//   detect this and DON'T overwrite the current CSS variables — the
//   previous palette stays put. This prevents a "flash to gold" when
//   a single backdrop fails to load. The default brand palette is
//   only used on the very first paint, before any extraction completes.

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { extractPalette } from "~/shared/utils/colorExtractor";
import type { SpotlightPick } from "~/shared/types";

/**
 * The size of the backdrop image we extract colors from. w500 is the
 * sweet spot: large enough for accurate color sampling (500px wide →
 * plenty of pixel diversity), small enough that the network fetch is
 * fast (~30-80KB vs ~200-400KB for w1280). The extraction itself
 * downsamples to 96×96 internally, so a larger source image gives
 * diminishing returns.
 *
 * IMPORTANT: this MUST match the CORS policy of image.tmdb.org. TMDB
 * sends `Access-Control-Allow-Origin: *` on all image responses, so
 * crossOrigin="anonymous" works (the colorExtractor sets it). If TMDB
 * ever changes this, extraction will silently fail and the previous
 * palette is kept — see FAILURE MODES above.
 */
const AMBIENT_PALETTE_IMAGE_SIZE = "w500" as const;

/**
 * Module-level cache of extracted palettes, keyed by image URL.
 *
 * Why module-level (not per-hook-instance)? The DiscoverPage can
 * unmount/remount on navigation, and useSpotlight's daily cache means
 * the same pick can reappear across sessions. A module-level cache
 * survives both — shuffling back to a previously-seen movie is instant.
 *
 * The cache is unbounded (a typical user sees <100 unique Spotlight
 * picks per year), so no eviction policy is needed. If this ever
 * becomes a memory concern, a simple LRU with max 50 entries would
 * suffice.
 */
const paletteCache = new Map<string, string[]>();

/**
 * The CSS variable names that AmbientBackground reads. Centralized
 * here so we can never typo a name in the effect.
 */
const AMBIENT_CSS_VARS = [
  "--ambient-color-1",
  "--ambient-color-2",
  "--ambient-color-3"
] as const;

/**
 * Reactive palette extraction for the AmbientBackground.
 *
 * @param pick — Accessor returning the current SpotlightPick (or null).
 *   When `pick()` changes AND the new pick has a different backdrop
 *   URL than the previous one, a palette is extracted and pushed to
 *   the three --ambient-color-* CSS variables on :root.
 *
 * Call this once from the DiscoverPage. The effect is automatically
 * disposed when DiscoverPage unmounts (SolidJS ties createEffect
 * lifecycles to the owning component).
 *
 * @example
 *   const { pick: spotlightPick } = useSpotlight({ ... });
 *   useAmbientPalette(spotlightPick);
 */
export function useAmbientPalette(
  pick: Accessor<SpotlightPick | null>
): void {
  // SSR guard — the effect body is a no-op on the server. We still
  // call createEffect so the hook has the same shape on both sides
  // (avoids hydration warnings).
  if (isServer) return;

  // Track the last URL we extracted for, so we can skip re-extraction
  // when the pick object identity changes but the backdrop URL is the
  // same (e.g. the pick's `reason` field updated but the movie didn't).
  let lastUrl: string | null = null;

  createEffect(() => {
    const current = pick();
    if (!current) {
      // No pick (loading or error state) — leave the previous palette
      // in place. The AmbientBackground keeps its current colors so
      // there's no jarring flash to the default brand palette.
      return;
    }

    // Resolve the backdrop URL — prefer backdrop_path, fall back to
    // poster_path (some indie titles have no backdrop). If neither
    // exists, we can't extract a palette; leave the previous one.
    const path =
      current.title.backdrop_path || current.title.poster_path;
    if (!path) return;

    const url = tmdbImage(path, AMBIENT_PALETTE_IMAGE_SIZE);
    if (!url || url === lastUrl) return;
    lastUrl = url;

    // Check the cache first — if we've already extracted this URL,
    // apply the cached palette immediately (no async work).
    const cached = paletteCache.get(url);
    if (cached) {
      applyPalette(cached);
      return;
    }

    // Cache miss — extract asynchronously. We don't await in the
    // effect; the effect returns immediately and the extraction runs
    // in a microtask. The previous palette stays visible until the
    // new one is ready, so the Spotlight crossfade isn't blocked.
    let cancelled = false;

    extractPalette(url, 3)
      .then((palette) => {
        if (cancelled) return;

        // Cache the result so future shuffles to this movie are instant.
        paletteCache.set(url, palette);
        applyPalette(palette);
      })
      .catch((err) => {
        // extractPalette is designed to never throw (it catches
        // internally and returns fallbacks), but if something truly
        // unexpected happens we log and leave the previous palette.
        if (!cancelled) {
          console.warn(
            "[useAmbientPalette] extractPalette rejected (leaving previous palette):",
            err
          );
        }
      });

    // If the pick changes again before extraction completes, cancel
    // the pending apply. The extraction itself can't be aborted (the
    // canvas pixel loop runs to completion), but the .then() handler
    // checks `cancelled` and skips the CSS variable write. This
    // prevents a slow extraction from overwriting a newer, faster
    // extraction's result.
    onCleanup(() => {
      cancelled = true;
    });
  });
}

/**
 * Apply a 3-color palette to the --ambient-color-* CSS variables on
 * document.documentElement.
 *
 * If the palette contains the fallback color (#FFD700) in ALL three
 * slots, extraction failed and we DON'T overwrite the current values
 * — the previous palette stays put. This prevents a "flash to gold"
 * when a single backdrop fails to load (CORS, 404, timeout).
 */
function applyPalette(palette: string[]): void {
  if (typeof document === "undefined") return;
  if (!Array.isArray(palette) || palette.length === 0) return;

  // Detect total failure — extractPalette returns 3x FALLBACK_COLOR
  // (#FFD700) when extraction fails. In that case, skip the write so
  // the previous palette persists.
  const allFallback = palette.every(
    (c) => c.toLowerCase() === "#ffd700"
  );
  if (allFallback) return;

  // Write each color to its corresponding CSS variable. The browser's
  // CSS transition engine handles the smooth morph — see the
  // `transition: background 1.5s ease-out` rule on .ambient-blob in
  // ambient-background.css.
  const root = document.documentElement;
  for (let i = 0; i < AMBIENT_CSS_VARS.length; i++) {
    const color = palette[i];
    if (color) {
      root.style.setProperty(AMBIENT_CSS_VARS[i], color);
    }
  }
}
