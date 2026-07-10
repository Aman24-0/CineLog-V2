// src/routes/settings/developer.tsx
import { Title } from "@solidjs/meta";
import { type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";

const DeveloperRoute: Component = () => {
  const env = import.meta.env;
  const version = "2.0.0";
  const buildTime = new Date().toISOString();

  const diagRows = [
    { key: "App Version", value: version },
    { key: "Build Time", value: buildTime },
    { key: "Environment", value: env.DEV ? "development" : "production" },
    { key: "SolidJS", value: "1.9.x" },
    { key: "Supabase Region", value: "ap-south-1" },
    { key: "TMDB API", value: env.VITE_TMDB_API_KEY ? "configured" : "missing" },
    { key: "Supabase URL", value: env.VITE_SUPABASE_URL ? "configured" : "missing" },
  ];

  return (
    <>
      <Title>CineLog — Developer</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_back</span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Developer</h1>
            <p class="sec-subtitle">Diagnostics, environment, and debug tools.</p>
          </div>

          <div class="sec-body">
            {/* Environment */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Environment</p>
              <div class="diag-block">
                {diagRows.map((row) => (
                  <div class="diag-line">
                    <span class="diag-key">{row.key}</span>
                    <span class="diag-value">{row.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Feature flags */}
            <section class="sec-section">
              <p class="sec-section-label">Feature Flags</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">flag</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Profile Page</span>
                    <span class="setting-row-desc">v2 portrait layout</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Enabled</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">flag</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Statistics Page</span>
                    <span class="setting-row-desc">Cinematic viewing insights</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Enabled</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">flag</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">History Page</span>
                    <span class="setting-row-desc">Chronological timeline</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Enabled</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">flag</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Achievements Page</span>
                    <span class="setting-row-desc">Museum-card milestones</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Enabled</span>
                </div>
              </div>
            </section>

            {/* Database */}
            <section class="sec-section">
              <p class="sec-section-label">Database</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">table_view</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Tables</span>
                    <span class="setting-row-desc">profiles, vault, collections, user_presets, episode_progress, user_preferences, tmdb_cache, curated_universes, user_universe_subscriptions</span>
                  </div>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">security</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">RLS</span>
                    <span class="setting-row-desc">Row-Level Security enabled on all user tables</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Active</span>
                </div>
              </div>
            </section>

            {/* Diagnostics */}
            <section class="sec-section">
              <p class="sec-section-label">Diagnostics</p>
              <div class="setting-group">
                <div class="setting-row focus-ring" style={{ cursor: "pointer" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">bug_report</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">View Console Logs</span>
                    <span class="setting-row-desc">Open browser dev tools → Console</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </div>
                <div class="setting-row focus-ring" style={{ cursor: "pointer" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">network_check</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Test Supabase Connection</span>
                    <span class="setting-row-desc">Ping the database</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </div>
                <div class="setting-row focus-ring" style={{ cursor: "pointer" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">cached</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Clear TMDB Cache</span>
                    <span class="setting-row-desc">Force re-fetch of all metadata</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default DeveloperRoute;
