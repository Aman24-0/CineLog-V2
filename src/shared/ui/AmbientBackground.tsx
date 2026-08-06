// src/shared/ui/AmbientBackground.tsx
//
// Phase 14 — Ambient Cinematic UI Redesign (Chunk 1: The Ambient Engine)
// ─────────────────────────────────────────────────────────────────────
// Replaces the flat #0a0a0a void with a premium, dynamic, multi-color
// frosted glass ambient background — inspired by DULO.TV and Apple TV.
//
// WHAT IT IS
//   A fixed, full-viewport, non-interactive layer that sits BEHIND all
//   app content (z-index: 0; chrome lives at z-index: 1+). It renders
//   three large, blurred radial-gradient blobs whose colors are driven
//   by CSS variables (--ambient-color-1/2/3). The blobs slowly drift
//   via pure-CSS transform animations so the background feels alive
//   without consuming CPU.
//
// WHAT IT IS NOT
//   • Not a JS-animated canvas. JS only swaps CSS variable values when
//     the Discover page extracts a new palette — the actual motion is
//     GPU-composited CSS transforms. Zero per-frame JS work.
//   • Not a per-route component. It's mounted ONCE in AppShell and
//     persists across all consumer route changes, so there's no
//     remount flash when navigating Discover → Watchlist → Profile.
//   • Not interactive. `pointer-events: none` means it never blocks
//     clicks, even when a blob visually overlaps a button.
//
// COLOR REACTIVITY
//   The blobs read from CSS variables on :root, with defaults set in
//   tokens/colors.css (cinematic gold + warm orange + cool blue — the
//   CineLog brand palette). The Discover page overrides these vars
//   reactively by calling `document.documentElement.style.setProperty`
//   from a createEffect that watches the Spotlight pick. When the
//   Spotlight changes (user shuffles, or the daily rotation fires),
//   the new palette is extracted from the new backdrop and pushed to
//   the CSS vars; the blobs morph to the new colors over 1.5s via the
//   `transition: background` rule in ambient-background.css.
//
// PERFORMANCE
//   • All animation is CSS (transform: translate3d + scale). The
//     compositor moves pre-painted layers — no layout, no paint per
//     frame.
//   • `will-change: transform` on desktop promotes each blob to its
//     own GPU layer. Dropped on mobile (max-width: 768px) to halve
//     GPU memory usage — see ambient-background.css for the full
//     mobile rationale.
//   • `filter: blur(80px)` (40px on mobile) is STATIC — the radius
//     never animates, so the GPU caches the blurred texture once.
//   • `prefers-reduced-motion: reduce` disables the float animation
//     entirely (the blobs become a static gradient — accessibility).
//
// MOUNTING
//   AppShell mounts this as the FIRST child of the consumer wrapper
//   div (the one with class `app-shell-bg`). The wrapper's background
//   is `var(--void-ambient)` (rgba(10,10,16,0.82)) — translucent
//   enough for the blobs to show through, opaque enough to keep text
//   contrast above WCAG AA. Admin and Landing routes keep solid
//   `var(--void)` so the ambient is hidden there (different contexts).
//
// WHY A COMPONENT, NOT JUST CSS?
//   The blobs could be a `::before` pseudo-element on body, but:
//     1. Pseudo-elements can't be conditionally rendered per route
//        (we want it on consumer routes, not admin/landing).
//     2. A real component lets us attach `aria-hidden` and a comment
//        block explaining the layer cake — discoverable in the DOM.
//     3. Future chunks may want to add a `<canvas>` particle layer or
//        a noise texture overlay; a component is the right extension
//        point.

import type { Component } from "solid-js";

/**
 * AmbientBackground — the fixed, full-viewport, multi-color frosted
 * glass ambient layer behind all app content.
 *
 * No props. No state. No effects. Pure presentational — the color
 * reactivity is driven by CSS variables that the Discover page sets
 * on `document.documentElement`.
 *
 * @example
 *   // In AppShell:
 *   <div class="app-shell-bg" style={{ background: "var(--void-ambient)" }}>
 *     <AmbientBackground />
 *     <AppHeader />
 *     <main>{props.children}</main>
 *     ...
 *   </div>
 */
const AmbientBackground: Component = () => {
  return (
    <div
      class="ambient-background"
      // Decorative — screen readers should ignore this entirely. The
      // blobs convey no information; they're pure ambiance. Setting
      // aria-hidden also removes them from the accessibility tree so
      // AT users don't have to skip past three "image" elements.
      aria-hidden="true"
      // No role — this is purely presentational. Adding role="img"
      // would force AT to announce it; adding role="presentation"
      // is redundant with aria-hidden. Better to emit no role.
    >
      {/* Blob 1 — top-left, primary accent. Default: cinema gold. */}
      <div class="ambient-blob ambient-blob-1" aria-hidden="true" />
      {/* Blob 2 — top-right, secondary accent. Default: warm orange. */}
      <div class="ambient-blob ambient-blob-2" aria-hidden="true" />
      {/* Blob 3 — bottom-center, tertiary accent. Default: cool blue.
          Larger + slower so it reads as the "base" the others float
          over. */}
      <div class="ambient-blob ambient-blob-3" aria-hidden="true" />
    </div>
  );
};

export default AmbientBackground;
