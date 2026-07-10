// src/routes/settings/appearance.tsx
import { Title } from "@solidjs/meta";
import { For, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import { theme, setTheme } from "~/core/theme";
import type { Theme } from "~/core/theme";

const THEMES_LIST: { id: Theme; name: string; desc: string; swatch: string }[] = [
  { id: "matrix", name: "Neon Green", desc: "CineLog default", swatch: "#39ff14" },
  { id: "sage", name: "Sage", desc: "Soft green", swatch: "#a8ff78" },
  { id: "netflix", name: "Crimson", desc: "Netflix red", swatch: "#ff2d55" },
  { id: "interstellar", name: "Interstellar", desc: "Deep blue", swatch: "#00c2ff" },
  { id: "neonhorizon", name: "Neon Horizon", desc: "Pink + cyan", swatch: "#ff2af0" },
  { id: "vibranium", name: "Vibranium", desc: "Purple", swatch: "#9d4edd" },
  { id: "cinematic", name: "Cinematic", desc: "Gold", swatch: "#FFD700" },
  { id: "pearl", name: "Pearl", desc: "Minimal white", swatch: "#ffffff" },
];

const AppearanceRoute: Component = () => {
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
            <p class="sec-subtitle">Choose your accent. The black theme stays.</p>
          </div>

          <div class="sec-body">
            {/* Live preview */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Live Preview</p>
              <div class="preview-card">
                <p class="preview-card-title">CineLog</p>
                <p class="preview-card-body">
                  This is how your accent looks on cards, buttons, and highlights.
                  The black background never changes — only the accent does.
                </p>
                <div style={{ display: "flex", gap: "var(--sp-2)", "margin-top": "var(--sp-3)" }}>
                  <span class="btn-primary" style={{ "pointer-events": "none" }}>Primary Button</span>
                  <span class="btn-ghost" style={{ "pointer-events": "none" }}>Ghost Button</span>
                </div>
              </div>
            </section>

            {/* Accent color / theme */}
            <section class="sec-section">
              <p class="sec-section-label">Accent Color</p>
              <div class="theme-grid">
                <For each={THEMES_LIST}>
                  {(t) => (
                    <button
                      type="button"
                      class="theme-card focus-ring"
                      data-active={theme() === t.id}
                      onClick={() => setTheme(t.id)}
                      aria-label={`Set theme to ${t.name}`}
                      aria-pressed={theme() === t.id}
                    >
                      <div class="theme-swatch" style={{ background: t.swatch }} aria-hidden="true" />
                      <p class="theme-name">{t.name}</p>
                    </button>
                  )}
                </For>
              </div>
            </section>

            {/* Density */}
            <section class="sec-section">
              <p class="sec-section-label">Density</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">density_default</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Comfortable</span>
                    <span class="setting-row-desc">Default spacing for readability</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "var(--p)" }}>Active</span>
                </div>
              </div>
            </section>

            {/* Accessibility */}
            <section class="sec-section">
              <p class="sec-section-label">Accessibility</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">accessibility</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Reduced Motion</span>
                    <span class="setting-row-desc">Follows your system preference automatically</span>
                  </div>
                  <span class="setting-row-value">System</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">contrast</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Contrast</span>
                    <span class="setting-row-desc">High contrast text on dark surfaces</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "var(--p)" }}>Active</span>
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
