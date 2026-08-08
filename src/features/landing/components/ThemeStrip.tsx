// src/features/landing/components/ThemeStrip.tsx
/**
 * ThemeStrip — compact personalization options showcase for the landing page.
 *
 * Renders a small horizontal strip showing:
 *   - Dark mode swatch (dark circle with cinema gold accent)
 *   - Cinema Cream swatch (warm cream circle)
 *   - Three accent color dots (gold, purple, cyan)
 *   - Font size indicators (A, A+, A++)
 *   - Density indicators (compact, normal)
 *
 * All purely visual — no interactivity on the landing page.
 * Small, compact, editorial feel.
 */

import { Component } from "solid-js";
import { GlassCard } from "~/shared/ui/glass";

// ─── Component ─────────────────────────────────────────────────

const ThemeStrip: Component = () => {
  return (
    <GlassCard
      variant="glass"
      size="compact"
      class="landing-theme-strip"
    >
      {/* Theme swatches */}
      <div class="landing-theme-strip__group">
        <span class="landing-theme-strip__group-label">Theme</span>
        <div class="landing-theme-strip__swatches">
          {/* Dark mode */}
          <div class="landing-theme-strip__swatch landing-theme-strip__swatch--dark">
            <div class="landing-theme-strip__swatch-accent" />
          </div>
          {/* Cinema Cream */}
          <div class="landing-theme-strip__swatch landing-theme-strip__swatch--cream" />
        </div>
      </div>

      {/* Divider */}
      <div class="landing-theme-strip__divider" aria-hidden="true" />

      {/* Accent colors */}
      <div class="landing-theme-strip__group">
        <span class="landing-theme-strip__group-label">Accent</span>
        <div class="landing-theme-strip__accents">
          {/* Gold */}
          <div class="landing-theme-strip__dot landing-theme-strip__dot--gold" />
          {/* Purple */}
          <div class="landing-theme-strip__dot landing-theme-strip__dot--purple" />
          {/* Cyan */}
          <div class="landing-theme-strip__dot landing-theme-strip__dot--cyan" />
        </div>
      </div>

      {/* Divider */}
      <div class="landing-theme-strip__divider" aria-hidden="true" />

      {/* Font sizes */}
      <div class="landing-theme-strip__group">
        <span class="landing-theme-strip__group-label">Font</span>
        <div class="landing-theme-strip__fonts">
          <span class="landing-theme-strip__font landing-theme-strip__font--sm">A</span>
          <span class="landing-theme-strip__font landing-theme-strip__font--md">A+</span>
          <span class="landing-theme-strip__font landing-theme-strip__font--lg">A++</span>
        </div>
      </div>

      {/* Divider */}
      <div class="landing-theme-strip__divider" aria-hidden="true" />

      {/* Density */}
      <div class="landing-theme-strip__group">
        <span class="landing-theme-strip__group-label">Density</span>
        <div class="landing-theme-strip__density">
          {/* Compact — 3 tight lines */}
          <div class="landing-theme-strip__density-option">
            <div class="landing-theme-strip__density-line landing-theme-strip__density-line--tight" />
            <div class="landing-theme-strip__density-line landing-theme-strip__density-line--tight" />
            <div class="landing-theme-strip__density-line landing-theme-strip__density-line--tight" />
          </div>
          {/* Normal — 2 spaced lines */}
          <div class="landing-theme-strip__density-option">
            <div class="landing-theme-strip__density-line landing-theme-strip__density-line--normal" />
            <div class="landing-theme-strip__density-line landing-theme-strip__density-line--normal" />
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

export default ThemeStrip;
