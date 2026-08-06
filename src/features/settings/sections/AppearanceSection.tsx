// src/features/settings/sections/AppearanceSection.tsx
//
// Appearance section — colour schemes (5 curated presets + Dynamic
// accent), ambient intensity, density, font size, poster quality,
// spoilers, accessibility.
//
// Pure JSX extractor: receives the `SettingsState` bag for local state
// (dynamic accent, banner URL, etc.) and imports the global preference
// signals/setters directly from `~/core/preferences`.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header.
//   • The inner panel:
//       - Colour scheme swatch grid (5 curated presets + 1 Dynamic)
//         [Phase 14 Chunk 4 — collapsed the old 12 accents into 5
//          curated schemes that each repaint accent + ambient together]
//       - Dynamic accent status line (3 states + Re-extract button)
//       - Ambient intensity segmented control (Phase 14 Chunk 2)
//       - Density segmented control
//       - Font size segmented control
//       - Poster quality segmented control
//       - Hide spoilers toggle
//       - Reduced motion segmented control
//       - High contrast toggle

import { Show, For } from "solid-js";
import type { SettingsState } from "./types";
import AccentSwatch from "~/features/settings/components/AccentSwatch";
import SectionResetButton from "~/features/settings/components/SectionResetButton";
import {
  ControlRow,
  ToggleRow
} from "~/features/settings/sharedControls";

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
  THEMES_LIST,
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
      <section
        id="section-appearance"
        class="settings-accordion-section"
      >
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
              {s.highlightText("Theme, accent, density, font")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("appearance")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("appearance")}>
          <div
            id="panel-appearance"
            class="settings-accordion-panel"
          >
            {/* Colour scheme — 5 curated swatches + 1 Dynamic.
                Phase 14 Chunk 4: collapsed the old 12 accent presets
                into 5 curated schemes. Each scheme sets BOTH the
                accent (`--p`) AND the ambient blob colors
                (`--ambient-color-1/2/3`), so picking a scheme repaints
                the entire UI in lockstep. */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Colour scheme</p>
              <div class="accent-swatch-row">
                <For each={THEMES_LIST}>
                  {(t) => (
                    <AccentSwatch
                      variant="preset"
                      id={t.id}
                      label={t.name}
                      color={t.swatch}
                      selected={s.isPresetActive(t.id)}
                      onSelect={() => s.handlePresetClick(t.id)}
                    />
                  )}
                </For>
                {/* 9th swatch — Dynamic */}
                <AccentSwatch
                  variant="dynamic"
                  id="dynamic"
                  label={s.extractingColor() ? "Extracting…" : "Dynamic"}
                  dynamicColor={s.dynamicAccentColor()}
                  selected={s.isDynamicActive()}
                  onSelect={() => void s.handleDynamicClick()}
                />
              </div>

              {/* ─── Dynamic accent status line ──────────────
                  Three states (per spec):
                    1. No banner set: "No banner set — using Gold accent"
                    2. Banner set, extracting: "Extracting color from banner…"
                    3. Banner set, extracted: "Banner accent: #XXXXXX"
                  Plus a Re-extract button (always shown when a
                  banner is present so the user can refresh after
                  changing their banner image).
              */}
              <Show
                when={s.extractingColor()}
                fallback={
                  <Show
                    when={s.bannerUrl()}
                    fallback={
                      /* State 1: No banner set */
                      <p class="accent-dynamic-info accent-dynamic-info-muted">
                        No banner set — using Gold accent.{" "}
                        <a
                          href="/profile"
                          class="settings-link-btn focus-ring"
                          aria-label="Set a banner on your profile"
                        >
                          Set a banner →
                        </a>
                      </p>
                    }
                  >
                    <Show
                      when={s.isDynamicActive() && s.dynamicAccentColor()}
                      fallback={
                        /* State with banner but not active */
                        <Show
                          when={s.dynamicAccentColor()}
                          fallback={
                            /* Banner set, never extracted */
                            <p class="accent-dynamic-info accent-dynamic-info-muted">
                              Banner detected. Tap "Dynamic" to
                              extract an accent color from it.
                            </p>
                          }
                        >
                          {/* Previously extracted, not currently active */}
                          <p class="accent-dynamic-info accent-dynamic-info-muted">
                            Last extracted:{" "}
                            <code>{s.dynamicAccentColor()}</code>
                            <button
                              type="button"
                              class="settings-link-btn focus-ring accent-dynamic-refresh"
                              onClick={() => void s.handleReextractDynamic()}
                              aria-label="Re-extract banner color"
                            >
                              Re-extract
                            </button>
                          </p>
                        </Show>
                      }
                    >
                      {/* State 3: Active and extracted */}
                      <div class="accent-dynamic-info">
                        <span>
                          Banner accent:{" "}
                          <code>{s.dynamicAccentColor()}</code>
                        </span>
                        <button
                          type="button"
                          class="settings-link-btn focus-ring accent-dynamic-refresh"
                          onClick={() => void s.handleReextractDynamic()}
                          aria-label="Re-extract banner color"
                          title="Re-extract color from your banner"
                        >
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "14px" }}
                            aria-hidden="true"
                          >
                            refresh
                          </span>
                          Re-extract
                        </button>
                      </div>
                    </Show>
                  </Show>
                }
              >
                {/* State 2: Extracting */}
                <p class="accent-dynamic-info">
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "14px",
                      animation: "spin 1s linear infinite"
                    }}
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                  Extracting color from banner…
                </p>
              </Show>
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
