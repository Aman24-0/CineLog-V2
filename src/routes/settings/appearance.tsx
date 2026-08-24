// src/routes/settings/appearance.tsx
//
// Appearance settings — non-theme presentation preferences for CineLog.
//
// The signed-in user’s Profile banner owns the app-wide colour, accent, and
// ambient environment. This route keeps the independent preferences for
// density, typography, image quality, content treatment, localization, and
// accessibility without offering a competing theme selector.

import { Title } from "@solidjs/meta";
import {
  For,
  Show,
  createSignal,
  ErrorBoundary,
  type Component
} from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import {
  density,
  setDensity,
  fontSize,
  setFontSize,
  posterQuality,
  setPosterQuality,
  hideSpoilers,
  setHideSpoilers,
  dateFormat,
  setDateFormat,
  reducedMotion,
  setReducedMotion,
  highContrast,
  setHighContrast
} from "~/core/preferences";
import {
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  POSTER_QUALITY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  REDUCED_MOTION_OPTIONS
} from "~/shared/constants/settings";

// ────────────────────────────────────────────────────────────────────
// Local UI state
// ────────────────────────────────────────────────────────────────────

const AppearanceRoute: Component = () => {
  const [spoilerRevealed, setSpoilerRevealed] = createSignal(false);

  // ─── Segmented control renderer ───
  // Supports optional `short` label for narrow viewports (rendered via CSS).
  const renderSegmented = <T extends string>(
    options: { id: T; label: string; short?: string }[],
    current: () => T,
    onChange: (id: T) => void,
    name: string
  ) => (
    <div class="segmented" role="radiogroup" aria-label={name}>
      <For each={options}>
        {(opt) => (
          <button
            type="button"
            class="segmented-btn focus-ring"
            data-active={current() === opt.id}
            role="radio"
            aria-checked={current() === opt.id}
            onClick={() => onChange(opt.id)}
          >
            <span class="segmented-label-long">{opt.label}</span>
            {opt.short && (
              <span class="segmented-label-short">{opt.short}</span>
            )}
          </button>
        )}
      </For>
    </div>
  );

  // ─── Setting row with inline control ───
  const renderControlRow = (
    icon: string,
    label: string,
    desc: string,
    control: () => unknown
  ) => (
    <div class="setting-row-control">
      <div class="setting-row-control-header">
        <div class="setting-row-icon" aria-hidden="true">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px" }}
            aria-hidden="true"
          >
            {icon}
          </span>
        </div>
        <div class="setting-row-control-meta">
          <span class="setting-row-control-label">{label}</span>
          <span class="setting-row-control-desc">{desc}</span>
        </div>
      </div>
      {control() as HTMLElement}
    </div>
  );

  // ─── Toggle renderer ───
  const renderToggle = (
    current: () => boolean,
    onChange: (v: boolean) => void,
    label: string
  ) => (
    <div
      class="toggle"
      data-on={current()}
      role="switch"
      aria-checked={current()}
      aria-label={label}
      onClick={() => onChange(!current())}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!current());
        }
      }}
      tabindex={0}
    >
      <div class="toggle-knob" />
    </div>
  );

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
          <div class="glass-empty-state" role="alert">
            <h3 class="glass-empty-state-title">Something went wrong</h3>
            <p class="glass-empty-state-body">{error.message}</p>
            <button
              class="btn-primary focus-ring"
              onClick={() => reset()}
              style={{ "margin-top": "var(--sp-2)" }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      <>
        <Title>CineLog — Appearance</Title>
        <PageContainer
          width="narrow"
          paddingTop="0"
          paddingBottom="var(--sp-12)"
        >
          <div class="sec-page sec-fade-in">
            {/* Header */}
            <div class="sec-header">
              <a
                href="/settings"
                class="sec-back focus-ring"
                aria-label="Back to settings"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px" }}
                  aria-hidden="true"
                >
                  arrow_back
                </span>
                Settings
              </a>
              <p class="sec-eyebrow">Settings</p>
              <h1 class="sec-title">Appearance</h1>
              <p class="sec-subtitle">
                Profile banner colour, density, type, and accessibility.
              </p>
            </div>

            <div class="sec-body">
              {/* ─── Live Preview ─── */}
              <section class="sec-section" style={{ "margin-top": "0" }}>
                <p class="sec-section-label">Live Preview</p>
                <div class="preview-card">
                  <p class="preview-card-title">CineLog</p>
                  <p class="preview-card-body">
                    This card reflects every setting below. Tap the spoiler text
                    to test hide-spoilers mode.
                  </p>
                  <div
                    class="preview-spoiler-demo"
                    data-spoiler="true"
                    data-spoiler-revealed={spoilerRevealed()}
                    onClick={() => setSpoilerRevealed((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setSpoilerRevealed((v) => !v);
                      }
                    }}
                    tabindex={0}
                    role="button"
                    aria-label="Toggle spoiler reveal"
                  >
                    <Show
                      when={spoilerRevealed()}
                      fallback="Tap to reveal spoiler — major plot twist ahead"
                    >
                      The detective was the villain all along.
                    </Show>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--sp-2)",
                      "margin-top": "var(--sp-3)"
                    }}
                  >
                    <span
                      class="btn-primary"
                      style={{ "pointer-events": "none" }}
                    >
                      Primary Button
                    </span>
                    <span
                      class="btn-ghost"
                      style={{ "pointer-events": "none" }}
                    >
                      Ghost Button
                    </span>
                  </div>
                </div>
              </section>

              {/* ─── 1. Colour environment ─── */}
              <section class="sec-section">
                <p class="sec-section-label">Colour environment</p>
                <div class="preview-card settings-banner-theme-info">
                  <span class="material-symbols-outlined" aria-hidden="true">
                    auto_awesome
                  </span>
                  <div>
                    <p class="preview-card-title">Profile banner driven</p>
                    <p class="preview-card-body">
                      CineLog derives the complete consumer-app ambient
                      background and accent from your profile banner. Update it
                      from Profile.
                    </p>
                  </div>
                </div>
              </section>

              {/* ─── 2. Display Density ─── */}
              <section class="sec-section">
                <p class="sec-section-label">Display Density</p>
                <div class="setting-group">
                  {renderControlRow(
                    "view_agenda",
                    "Spacing & padding",
                    "Compact fits more per screen. Spacious gives larger touch targets.",
                    () =>
                      renderSegmented(
                        DENSITY_OPTIONS,
                        density,
                        (id) => setDensity(id),
                        "Display density"
                      )
                  )}
                </div>
              </section>

              {/* ─── 3. Typography ─── */}
              <section class="sec-section">
                <p class="sec-section-label">Typography</p>
                <div class="setting-group">
                  {renderControlRow(
                    "text_fields",
                    "Font size",
                    "Scales body text app-wide.",
                    () =>
                      renderSegmented(
                        FONT_SIZE_OPTIONS,
                        fontSize,
                        (id) => setFontSize(id),
                        "Font size"
                      )
                  )}
                </div>
              </section>

              {/* ─── 4. Content ─── */}
              <section class="sec-section">
                <p class="sec-section-label">Content</p>
                <div class="setting-group">
                  {renderControlRow(
                    "image",
                    "Poster quality",
                    "High uses original sizes. Low saves mobile data.",
                    () =>
                      renderSegmented(
                        POSTER_QUALITY_OPTIONS,
                        posterQuality,
                        (id) => setPosterQuality(id),
                        "Poster quality"
                      )
                  )}
                  <div class="setting-row-control">
                    <div class="setting-row-control-header">
                      <div class="setting-row-icon" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "16px" }}
                          aria-hidden="true"
                        >
                          visibility_off
                        </span>
                      </div>
                      <div class="setting-row-control-meta">
                        <span class="setting-row-control-label">
                          Hide spoilers
                        </span>
                        <span class="setting-row-control-desc">
                          Blur plot details until tapped.
                        </span>
                      </div>
                      {renderToggle(
                        hideSpoilers,
                        (v) => setHideSpoilers(v),
                        "Hide spoilers"
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* ─── 5. Localization ─── */}
              <section class="sec-section">
                <p class="sec-section-label">Localization</p>
                <div class="setting-group">
                  <div class="setting-row-control">
                    <div class="setting-row-control-header">
                      <div class="setting-row-icon" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "16px" }}
                          aria-hidden="true"
                        >
                          calendar_month
                        </span>
                      </div>
                      <div class="setting-row-control-meta">
                        <span class="setting-row-control-label">
                          Date format
                        </span>
                        <span class="setting-row-control-desc">
                          Applied to dates across cards, lists, and detail
                          pages. Today:{" "}
                          <strong style={{ color: "var(--p)" }}>
                            {
                              DATE_FORMAT_OPTIONS.find(
                                (o) => o.id === dateFormat()
                              )?.example
                            }
                          </strong>
                        </span>
                      </div>
                    </div>
                    {renderSegmented(
                      DATE_FORMAT_OPTIONS,
                      dateFormat,
                      (id) => setDateFormat(id),
                      "Date format"
                    )}
                  </div>
                </div>
              </section>

              {/* ─── 6. Accessibility ─── */}
              <section class="sec-section">
                <p class="sec-section-label">Accessibility</p>
                <div class="setting-group">
                  {renderControlRow(
                    "animation",
                    "Reduced motion",
                    "On disables animations. System follows your OS.",
                    () =>
                      renderSegmented(
                        REDUCED_MOTION_OPTIONS,
                        reducedMotion,
                        (id) => setReducedMotion(id),
                        "Reduced motion"
                      )
                  )}
                  <div class="setting-row-control">
                    <div class="setting-row-control-header">
                      <div class="setting-row-icon" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "16px" }}
                          aria-hidden="true"
                        >
                          contrast
                        </span>
                      </div>
                      <div class="setting-row-control-meta">
                        <span class="setting-row-control-label">
                          High contrast
                        </span>
                        <span class="setting-row-control-desc">
                          Boosts text brightness and border opacity.
                        </span>
                      </div>
                      {renderToggle(
                        highContrast,
                        (v) => setHighContrast(v),
                        "High contrast"
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </PageContainer>
      </>
    </ErrorBoundary>
  );
};

export default AppearanceRoute;
