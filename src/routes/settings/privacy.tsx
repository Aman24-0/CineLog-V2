// src/routes/settings/privacy.tsx
import { Title } from "@solidjs/meta";
import { type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";

const PrivacyRoute: Component = () => {
  return (
    <>
      <Title>CineLog — Privacy</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_back</span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Privacy</h1>
            <p class="sec-subtitle">Your data is yours. CineLog is personal, not social.</p>
          </div>

          <div class="sec-body">
            {/* Privacy promise */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <div class="insight-card">
                <div class="insight-card-header">
                  <div class="insight-card-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">shield</span>
                  </div>
                  <p class="insight-card-title">Your data stays yours</p>
                </div>
                <p class="insight-card-body">
                  CineLog is a <strong>single-player tracking app</strong>. Your watchlist, ratings, and profile
                  are visible only to you. <span class="accent">No followers, no public feed, no social graph.</span>
                  We don't sell your data. We don't show ads. We don't track you across other sites.
                </p>
              </div>
            </section>

            {/* Data storage */}
            <section class="sec-section">
              <p class="sec-section-label">Data Storage</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">cloud</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Supabase (PostgreSQL)</span>
                    <span class="setting-row-desc">Your watchlist, profile, collections — encrypted at rest</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Secured</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">movie</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">TMDB API</span>
                    <span class="setting-row-desc">Movie/TV metadata — fetched read-only, cached locally</span>
                  </div>
                  <span class="setting-row-value">Read-only</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">storage</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Local Storage</span>
                    <span class="setting-row-desc">Theme preference + search history — on this device only</span>
                  </div>
                  <span class="setting-row-value">Device-only</span>
                </div>
              </div>
            </section>

            {/* Visibility */}
            <section class="sec-section">
              <p class="sec-section-label">Visibility</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">visibility_off</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Profile</span>
                    <span class="setting-row-desc">Visible only to you — no public profile page</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Private</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">lock</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Watchlist</span>
                    <span class="setting-row-desc">No one else can see what you watch</span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>Private</span>
                </div>
              </div>
            </section>

            {/* Your rights */}
            <section class="sec-section">
              <p class="sec-section-label">Your Rights</p>
              <div class="setting-group">
                <a href="/settings/sync" class="setting-row focus-ring" aria-label="Export your data">
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">download</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Export Your Data</span>
                    <span class="setting-row-desc">Download your full watchlist as JSON</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </a>
                <a href="/settings/account" class="setting-row focus-ring setting-row-danger" aria-label="Delete your account">
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">delete_forever</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Delete Account</span>
                    <span class="setting-row-desc">Permanently remove all your data</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </a>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default PrivacyRoute;
