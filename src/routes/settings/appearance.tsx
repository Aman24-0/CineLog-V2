// src/routes/settings/appearance.tsx
import { Title } from "@solidjs/meta";
import { For, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import { theme, setTheme } from "~/core/theme";
import type { Theme } from "~/core/theme";

const THEMES_LIST: { id: Theme; name: string; desc: string }[] = [
  { id: "matrix", name: "Neon Green", desc: "CineLog default" },
  { id: "sage", name: "Sage", desc: "Soft green" },
  { id: "netflix", name: "Crimson", desc: "Netflix red" },
  { id: "interstellar", name: "Interstellar", desc: "Deep blue" },
  { id: "neonhorizon", name: "Neon Horizon", desc: "Pink + cyan" },
  { id: "vibranium", name: "Vibranium", desc: "Purple" },
  { id: "cinematic", name: "Cinematic", desc: "Gold" },
  { id: "pearl", name: "Pearl", desc: "Minimal white" },
];

const AppearanceRoute: Component = () => {
  return (
    <>
      <Title>CineLog — Appearance</Title>
      <PageContainer width="narrow" paddingBottom="var(--sp-12)">
        <div class="profile-fade-in" style={{ "padding-top": "var(--sp-8)" }}>
          <a href="/settings" class="settings-back focus-ring" aria-label="Back to settings">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Settings
          </a>
          <div class="settings-header">
            <p class="settings-eyebrow">Settings</p>
            <h1 class="settings-title">Appearance</h1>
            <p class="settings-subtitle">Choose your accent. The black theme stays.</p>
          </div>
          <div class="settings-body">
            <div class="settings-group">
              <For each={THEMES_LIST}>
                {(t) => (
                  <button
                    type="button"
                    class="settings-row focus-ring"
                    onClick={() => setTheme(t.id)}
                    aria-label={`Set theme to ${t.name}`}
                    aria-pressed={theme() === t.id}
                  >
                    <div class="settings-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        {theme() === t.id ? "check_circle" : "circle"}
                      </span>
                    </div>
                    <div class="settings-row-text">
                      <span class="settings-row-label">{t.name}</span>
                      <span class="settings-row-desc">{t.desc}</span>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default AppearanceRoute;
