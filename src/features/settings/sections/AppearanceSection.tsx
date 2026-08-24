// src/features/settings/sections/AppearanceSection.tsx
//
// Appearance section — profile-banner environment, ambient intensity,
// density, font size, poster quality, spoilers, and accessibility.
//
// The profile banner is the single source of app-wide colour and ambient
// identity. This section intentionally exposes only presentation preferences
// that do not compete with that source of truth.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header.
//   • The inner panel:
//       - Profile-banner environment explanation
//       - Ambient intensity segmented control (Phase 14 Chunk 2)
//       - Density segmented control
//       - Font size segmented control
//       - Poster quality segmented control
//       - Hide spoilers toggle
//       - Reduced motion segmented control
//       - High contrast toggle

import { Show } from "solid-js";
import type { SettingsState } from "./types";
import SectionResetButton from "~/features/settings/components/SectionResetButton";
import { ControlRow, ToggleRow } from "~/features/settings/sharedControls";

// Global preference signals/setters — imported directly.
import {
  density,
  setDensity,
  fontSize,
  setFontSize,
  posterQuality,
  setPosterQuality,
  hideSpoilers,
  setHideSpoilers,
  reducedMotion,
  setReducedMotion,
  highContrast,
  setHighContrast,
  ambientIntensity,
  setAmbientIntensity
} from "~/core/preferences";

// Static option lists — single source of truth.
import {
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  POSTER_QUALITY_OPTIONS,
  REDUCED_MOTION_OPTIONS,
  AMBIENT_INTENSITY_OPTIONS
} from "~/shared/constants/settings";

export function AppearanceSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show when={s.filteredSections().some((sec) => sec.id === "appearance")}>
      <section id="section-appearance" class="settings-accordion-section">
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("appearance")}
          aria-expanded={s.isExpanded("appearance")}
          aria-controls="panel-appearance"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
          >
            palette
          </span>
          <div class="settings-accordion-meta">
            <span class="settings-accordion-title">
              {s.highlightText("Appearance")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Profile colour, ambient, density, font")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("appearance") ? "rotate(180deg)" : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("appearance")}>
          <div id="panel-appearance" class="settings-accordion-panel">
            {/* ─── Colour environment ─────────────────────────────── */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Colour environment</p>
              <div class="settings-banner-theme-info">
                <span
                  class="material-symbols-outlined settings-accordion-icon"
                  aria-hidden="true"
                >
                  auto_awesome
                </span>
                <div>
                  <strong>Profile banner driven</strong>
                  <p>
                    CineLog automatically derives the app background, ambient
                    color, accent, and readable active states from your profile
                    banner. Change the banner from your Profile page.
                  </p>
                </div>
              </div>
            </div>

            {/* ─── Phase 14 Chunk 2 — Ambient Intensity ──────────────
                Controls how prominent the multi-color ambient blobs
                behind the app content are. The preference sets a
                data-attribute on <html>+<body> that drives the
                --ambient-intensity CSS var, which the .ambient-blob
                rule multiplies into its opacity (see
                ambient-background.css + colors.css).

                Subtle  → ~0.25 effective opacity (barely-there wash)
                Normal  → ~0.49 effective opacity (default, balanced)
                Vibrant → ~0.70 effective opacity (full color bleed)

                The transition between levels is animated via the
                `transition: opacity 600ms ease-out` rule on
                .ambient-blob, so users see a smooth fade when they
                toggle. */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Ambient intensity</p>
              <div class="setting-group">
                <ControlRow
                  icon="blur_on"
                  label="Background vibrance"
                  desc="How strong the ambient color wash is."
                >
                  {s.renderSegmented(
                    AMBIENT_INTENSITY_OPTIONS,
                    ambientIntensity,
                    (id) => setAmbientIntensity(id),
                    "Ambient intensity"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Density */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Density</p>
              <div class="setting-group">
                <ControlRow
                  icon="view_agenda"
                  label="Spacing"
                  desc="How compact cards and lists are."
                >
                  {s.renderSegmented(
                    DENSITY_OPTIONS,
                    density,
                    (id) => setDensity(id),
                    "Density"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Font size */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Font size</p>
              <div class="setting-group">
                <ControlRow
                  icon="text_fields"
                  label="Text size"
                  desc="Scales body text app-wide."
                >
                  {s.renderSegmented(
                    FONT_SIZE_OPTIONS,
                    fontSize,
                    (id) => setFontSize(id),
                    "Font size"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Poster quality */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Poster quality</p>
              <div class="setting-group">
                <ControlRow
                  icon="image"
                  label="Image resolution"
                  desc="Lower saves mobile data."
                >
                  {s.renderSegmented(
                    POSTER_QUALITY_OPTIONS,
                    posterQuality,
                    (id) => setPosterQuality(id),
                    "Poster quality"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Hide spoilers */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Spoilers</p>
              <div class="setting-group">
                <ToggleRow
                  icon="visibility_off"
                  label="Hide spoilers"
                  desc="Blur plot details until tapped."
                  current={hideSpoilers}
                  onChange={setHideSpoilers}
                />
              </div>
            </div>

            {/* Accessibility */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Accessibility</p>
              <div class="setting-group">
                <ControlRow
                  icon="animation"
                  label="Reduced motion"
                  desc="Disable animations app-wide."
                >
                  {s.renderSegmented(
                    REDUCED_MOTION_OPTIONS,
                    reducedMotion,
                    (id) => setReducedMotion(id),
                    "Reduced motion"
                  )}
                </ControlRow>
                <ToggleRow
                  icon="contrast"
                  label="High contrast"
                  desc="Boost text and border brightness."
                  current={highContrast}
                  onChange={setHighContrast}
                />
              </div>
            </div>

            <SectionResetButton state={s} sectionId="appearance" />
          </div>
        </Show>
      </section>
    </Show>
  );
}
