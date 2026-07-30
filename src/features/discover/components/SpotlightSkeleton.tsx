// src/features/discover/components/SpotlightSkeleton.tsx
import { type Component } from "solid-js";

/**
 * SpotlightSkeleton — the loading placeholder for the Spotlight fold.
 *
 * Renders the EXACT same shell as a populated Spotlight (badge +
 * backdrop fallback + content cluster) but with shimmering skeleton
 * bars in place of the title, meta pills, and actions. This way the
 * page never shows the "We couldn't pick a Spotlight right now. Try
 * again in a moment." error message during the brief initial fetch —
 * the user sees a skeleton immediately on first paint (including SSR)
 * and the real content fades in once the pick resolves.
 *
 * The skeleton uses the same `.spotlight-skeleton-*` CSS classes that
 * the existing Spotlight component already used for its inline loading
 * state, so the visual language is consistent.
 */
const SpotlightSkeleton: Component = () => {
  return (
    <section
      class="spotlight"
      role="region"
      aria-label="Spotlight — loading"
      aria-busy="true"
    >
      {/* Backdrop fallback — solid gradient so the skeleton isn't
          rendered on a transparent background. */}
      <div class="spotlight-backdrop-fallback" aria-hidden="true" />

      {/* Multi-layer gradient overlay (same as the populated Spotlight) */}
      <div class="spotlight-overlay" aria-hidden="true" />

      {/* Top-left badge — keeps the fold identity visible while loading */}
      <div class="spotlight-badge">
        <span class="material-symbols-outlined" aria-hidden="true">
          auto_awesome
        </span>
        Spotlight
      </div>

      {/* Content cluster — shimmering placeholder bars */}
      <div class="spotlight-content">
        <div class="spotlight-skeleton" aria-hidden="true">
          <div class="spotlight-skeleton-reason" />
          <div class="spotlight-skeleton-title" />
          <div class="spotlight-skeleton-meta" />
          <div class="spotlight-skeleton-actions" />
        </div>
      </div>
    </section>
  );
};

export default SpotlightSkeleton;
