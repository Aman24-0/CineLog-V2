// src/routes/settings/appearance.tsx
//
// Appearance settings — the single source of truth for how CineLog looks.
//
// 9 controls, organized into 6 sections:
//   1. Accent Color      — 8 curated presets + custom hex picker (9th tile)
//   2. Theme Mode        — Dark / Light / System
//   3. Display Density   — Compact / Comfortable / Spacious
//   4. Typography        — Font Size: Small / Medium / Large
//   5. Content           — Poster Quality, Hide Spoilers
//   6. Localization      — Date Format
//   7. Accessibility     — Reduced Motion, High Contrast
//
// Every control is wired to a signal in src/core/preferences, which:
//   • Persists to localStorage (cinelog_* prefix)
//   • Applies a data-attribute to <html> for CSS to react to
//   • Updates the live preview card in real time
//
// Design language: matches the rest of /settings/* — Bebas Neue title,
// Azeret Mono eyebrow + section labels, glass surface preview card,
// segmented controls for multi-option choices, iOS toggles for binary.

import { Title } from "@solidjs/meta";
import { For, Show, createSignal, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import { theme, setTheme } from "~/core/theme";
import type { Theme } from "~/core/theme";
import {
  themeMode,
  setThemeMode,
  customAccent,
  setCustomAccent,
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
  setHighContrast,
  contrastOn,
  type ThemeMode,
  type Density,
  type FontSize,
  type PosterQuality,
  type DateFormat,
  type ReducedMotionPref,
} from "~/core/preferences";

// ────────────────────────────────────────────────────────────────────
// Curated accent presets (matches src/styles/tokens/colors.css)
// ────────────────────────────────────────────────────────────────────
const THEMES_LIST: { id: Theme; name: string; desc: string; swatch: string }[] = [
  { id: "sage",         name: "Sage",          desc: "Soft green",      swatch: "#a8ff78" },
  { id: "matrix",       name: "Neon Green",    desc: "CineLog default", swatch: "#39ff14" },
  { id: "netflix",      name: "Crimson",       desc: "Netflix red",     swatch: "#ff2d55" },
  { id: "interstellar", name: "Interstellar",  desc: "Deep blue",       swatch: "#00c2ff" },
  { id: "neonhorizon",  name: "Neon Horizon",  desc: "Pink + cyan",     swatch: "#ff2af0" },
  { id: "vibranium",    name: "Vibranium",     desc: "Purple",          swatch: "#9d4edd" },
  { id: "cinematic",    name: "Cinematic",     desc: "Gold",            swatch: "#FFD700" },
  { id: "pearl",        name: "Pearl",         desc: "Minimal white",   swatch: "#ffffff" },
];

// ────────────────────────────────────────────────────────────────────
// Segmented control option metadata
// ────────────────────────────────────────────────────────────────────
const THEME_MODE_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "dark",   label: "Dark" },
  { id: "light",  label: "Light" },
  { id: "system", label: "System" },
];

const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: "compact",    label: "Compact" },
  { id: "comfortable", label: "Comfort" },
  { id: "spacious",   label: "Spacious" },
];

const FONT_SIZE_OPTIONS: { id: FontSize; label: string }[] = [
  { id: "small",  label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large",  label: "Large" },
];

const POSTER_QUALITY_OPTIONS: { id: PosterQuality; label: string }[] = [
  { id: "high",   label: "High" },
  { id: "medium", label: "Med" },
  { id: "low",    label: "Low" },
  { id: "auto",   label: "Auto" },
];

const DATE_FORMAT_OPTIONS: { id: DateFormat; label: string; short: string; example: string }[] = [
  { id: "dmy", label: "DD/MM/YYYY", short: "D/M/Y", example: "15/07/2026" },
  { id: "mdy", label: "MM/DD/YYYY", short: "M/D/Y", example: "07/15/2026" },
  { id: "ymd", label: "YYYY-MM-DD", short: "Y-M-D", example: "2026-07-15" },
];

const REDUCED_MOTION_OPTIONS: { id: ReducedMotionPref; label: string }[] = [
  { id: "off",    label: "Off" },
  { id: "on",     label: "On" },
  { id: "system", label: "System" },
];

// ────────────────────────────────────────────────────────────────────
// Local UI state
// ────────────────────────────────────────────────────────────────────

const AppearanceRoute: Component = () => {
  // Color input value — synced from customAccent() but editable as text
  const [hexInput, setHexInput] = createSignal(customAccent() || "#a8ff78");
  const [spoilerRevealed, setSpoilerRevealed] = createSignal(false);

  const isPresetActive = (presetId: Theme): boolean =>
    customAccent() === "" && theme() === presetId;

  const isCustomActive = (): boolean => customAccent() !== "";

  const handlePresetClick = (presetId: Theme) => {
    setCustomAccent("");
    setTheme(presetId);
  };

  const handleCustomColorChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const hex = target.value;
    setHexInput(hex);
    setCustomAccent(hex);
    // When custom accent is set, we still want a "theme" class for other
    // tokens (--p-glow formula etc.), but inline styles override --p.
    // No need to change theme() — its class can stay.
  };

  const handleHexInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    let v = target.value.trim();
    if (!v.startsWith("#")) v = "#" + v;
    setHexInput(v);
    if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v)) {
      setCustomAccent(v);
    }
  };

  const handleClearCustom = () => {
    setCustomAccent("");
    setHexInput(theme() === "matrix" ? "#39ff14" : "#a8ff78");
  };

  // ─── Segmented control renderer ───
  // Supports optional `short` label for narrow viewports (rendered via CSS).
  const renderSegmented = <T extends string>(
    options: { id: T; label: string; short?: string }[],
    current: () => T,
    onChange: (id: T) => void,
    name: string,
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
            {opt.short && <span class="segmented-label-short">{opt.short}</span>}
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
    control: () => unknown,
  ) => (
    <div class="setting-row-control">
      <div class="setting-row-control-header">
        <div class="setting-row-icon" aria-hidden="true">
          <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">{icon}</span>
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
  const renderToggle = (current: () => boolean, onChange: (v: boolean) => void, label: string) => (
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
    <>
      <Title>CineLog — Appearance</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          {/* Header */}
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
                arrow_back
              </span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Appearance</h1>
            <p class="sec-subtitle">
              Make CineLog yours. Accent, theme, density, type, and accessibility — all live.
            </p>
          </div>

          <div class="sec-body">
            {/* ─── Live Preview ─── */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Live Preview</p>
              <div class="preview-card">
                <p class="preview-card-title">CineLog</p>
                <p class="preview-card-body">
                  This card reflects every setting below — accent, density, font size,
                  contrast. Tap the spoiler text to test hide-spoilers mode.
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
                  <Show when={spoilerRevealed()} fallback="Tap to reveal spoiler — major plot twist ahead">
                    The detective was the villain all along.
                  </Show>
                </div>
                <div style={{ display: "flex", gap: "var(--sp-2)", "margin-top": "var(--sp-3)" }}>
                  <span class="btn-primary" style={{ "pointer-events": "none" }}>Primary Button</span>
                  <span class="btn-ghost" style={{ "pointer-events": "none" }}>Ghost Button</span>
                </div>
              </div>
            </section>

            {/* ─── 1. Accent Color ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Accent Color</p>
              <div class="theme-grid">
                <For each={THEMES_LIST}>
                  {(t) => (
                    <button
                      type="button"
                      class="theme-card focus-ring"
                      data-active={isPresetActive(t.id)}
                      onClick={() => handlePresetClick(t.id)}
                      aria-label={`Set accent to ${t.name}`}
                      aria-pressed={isPresetActive(t.id)}
                    >
                      <div class="theme-swatch" style={{ background: t.swatch }} aria-hidden="true" />
                      <p class="theme-name">{t.name}</p>
                    </button>
                  )}
                </For>
                {/* 9th tile — custom hex picker */}
                <label
                  class="theme-card-custom focus-ring"
                  data-active={isCustomActive()}
                  aria-label="Custom accent color"
                  aria-pressed={isCustomActive()}
                >
                  <div
                    class="theme-card-custom-swatch"
                    style={{
                      background: isCustomActive()
                        ? customAccent()
                        : "linear-gradient(135deg, var(--p) 0%, var(--p) 50%, var(--tier-3) 50%, var(--tier-3) 100%)",
                    }}
                    aria-hidden="true"
                  >
                    <span class="material-symbols-outlined" style={{ "font-size": "16px", color: isCustomActive() ? contrastOn(customAccent()) : "var(--text-soft)" }} aria-hidden="true">
                      palette
                    </span>
                  </div>
                  <input
                    type="color"
                    value={isCustomActive() ? customAccent() : "#a8ff78"}
                    onInput={handleCustomColorChange}
                    aria-label="Pick custom accent color"
                  />
                  <p class="theme-card-custom-name">Custom</p>
                </label>
              </div>

              {/* Custom hex input row — visible when custom is active */}
              <Show when={isCustomActive()}>
                <div class="custom-hex-row">
                  <div
                    class="custom-hex-swatch"
                    style={{ background: customAccent() }}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    class="custom-hex-input focus-ring"
                    value={hexInput().toUpperCase()}
                    onInput={handleHexInputChange}
                    placeholder="#A8FF78"
                    maxlength={7}
                    aria-label="Custom accent hex value"
                  />
                  <button
                    type="button"
                    class="custom-hex-clear focus-ring"
                    onClick={handleClearCustom}
                    aria-label="Clear custom accent, use preset"
                  >
                    Reset
                  </button>
                </div>
              </Show>
            </section>

            {/* ─── 2. Theme Mode ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Theme Mode</p>
              <div class="setting-group">
                {renderControlRow(
                  "dark_mode",
                  "Background theme",
                  "Dark is the cinematic default. Light is warm paper for daytime. System follows your OS.",
                  () => renderSegmented(THEME_MODE_OPTIONS, themeMode, (id) => setThemeMode(id), "Theme mode"),
                )}
              </div>
            </section>

            {/* ─── 3. Display Density ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Display Density</p>
              <div class="setting-group">
                {renderControlRow(
                  "view_agenda",
                  "Spacing & padding",
                  "Compact fits more titles per screen (desktop). Spacious gives larger touch targets (phone).",
                  () => renderSegmented(DENSITY_OPTIONS, density, (id) => setDensity(id), "Display density"),
                )}
              </div>
            </section>

            {/* ─── 4. Typography ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Typography</p>
              <div class="setting-group">
                {renderControlRow(
                  "text_fields",
                  "Font size",
                  "Scales body text app-wide. Small fits more, Large improves readability.",
                  () => renderSegmented(FONT_SIZE_OPTIONS, fontSize, (id) => setFontSize(id), "Font size"),
                )}
              </div>
            </section>

            {/* ─── 5. Content ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Content</p>
              <div class="setting-group">
                {renderControlRow(
                  "image",
                  "Poster quality",
                  "High uses original TMDB sizes. Low saves mobile data. Auto detects your connection.",
                  () => renderSegmented(POSTER_QUALITY_OPTIONS, posterQuality, (id) => setPosterQuality(id), "Poster quality"),
                )}
                <div class="setting-row-control">
                  <div class="setting-row-control-header">
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">visibility_off</span>
                    </div>
                    <div class="setting-row-control-meta">
                      <span class="setting-row-control-label">Hide spoilers</span>
                      <span class="setting-row-control-desc">Blur synopses, season descriptions, and plot details until tapped.</span>
                    </div>
                    {renderToggle(hideSpoilers, (v) => setHideSpoilers(v), "Hide spoilers")}
                  </div>
                </div>
              </div>
            </section>

            {/* ─── 6. Localization ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Localization</p>
              <div class="setting-group">
                <div class="setting-row-control">
                  <div class="setting-row-control-header">
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">calendar_month</span>
                    </div>
                    <div class="setting-row-control-meta">
                      <span class="setting-row-control-label">Date format</span>
                      <span class="setting-row-control-desc">
                        Applied to dates across cards, lists, and detail pages. Today:{" "}
                        <strong style={{ color: "var(--p)" }}>
                          {DATE_FORMAT_OPTIONS.find((o) => o.id === dateFormat())?.example}
                        </strong>
                      </span>
                    </div>
                  </div>
                  {renderSegmented(DATE_FORMAT_OPTIONS, dateFormat, (id) => setDateFormat(id), "Date format")}
                </div>
              </div>
            </section>

            {/* ─── 7. Accessibility ─── */}
            <section class="sec-section">
              <p class="sec-section-label">Accessibility</p>
              <div class="setting-group">
                {renderControlRow(
                  "animation",
                  "Reduced motion",
                  "On disables all animations and transitions. System follows your OS preference.",
                  () => renderSegmented(REDUCED_MOTION_OPTIONS, reducedMotion, (id) => setReducedMotion(id), "Reduced motion"),
                )}
                <div class="setting-row-control">
                  <div class="setting-row-control-header">
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">contrast</span>
                    </div>
                    <div class="setting-row-control-meta">
                      <span class="setting-row-control-label">High contrast</span>
                      <span class="setting-row-control-desc">Boosts text brightness and border opacity for better readability.</span>
                    </div>
                    {renderToggle(highContrast, (v) => setHighContrast(v), "High contrast")}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default AppearanceRoute;
