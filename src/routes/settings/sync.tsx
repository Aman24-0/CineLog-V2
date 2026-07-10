// src/routes/settings/sync.tsx
import { Title } from "@solidjs/meta";
import { type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";

const SyncRoute: Component = () => {
  return (
    <>
      <Title>CineLog — Sync</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_back</span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Sync</h1>
            <p class="sec-subtitle">Your data syncs automatically. No manual action needed.</p>
          </div>

          <div class="sec-body">
            {/* Status cards */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Status</p>
              <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
                <div class="status-card">
                  <div class="status-card-icon status-card-icon-ok" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">cloud_done</span>
                  </div>
                  <div class="status-card-text">
                    <p class="status-card-label">Supabase — Connected</p>
                    <p class="status-card-value">Real-time sync active · ap-south-1</p>
                  </div>
                </div>
                <div class="status-card">
                  <div class="status-card-icon status-card-icon-ok" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">movie</span>
                  </div>
                  <div class="status-card-text">
                    <p class="status-card-label">TMDB — Connected</p>
                    <p class="status-card-value">Cached metadata · v3 API</p>
                  </div>
                </div>
                <div class="status-card">
                  <div class="status-card-icon status-card-icon-ok" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">wifi</span>
                  </div>
                  <div class="status-card-text">
                    <p class="status-card-label">Online</p>
                    <p class="status-card-value">All changes sync instantly</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Last sync */}
            <section class="sec-section">
              <p class="sec-section-label">Sync Details</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">schedule</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Last Sync</span>
                    <span class="setting-row-desc">Just now — automatic</span>
                  </div>
                  <span class="setting-row-value">Live</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">queue</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Queued Changes</span>
                    <span class="setting-row-desc">No pending changes</span>
                  </div>
                  <span class="setting-row-value">0</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">database</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Database</span>
                    <span class="setting-row-desc">PostgreSQL 17 · Supabase</span>
                  </div>
                  <span class="setting-row-value">Healthy</span>
                </div>
              </div>
            </section>

            {/* Import / Export */}
            <section class="sec-section">
              <p class="sec-section-label">Import / Export</p>
              <div class="setting-group">
                <div class="setting-row focus-ring" style={{ cursor: "pointer" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">download</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Export Watchlist</span>
                    <span class="setting-row-desc">Download all your titles as JSON</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </div>
                <div class="setting-row focus-ring" style={{ cursor: "pointer" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">upload</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Import Watchlist</span>
                    <span class="setting-row-desc">Restore from a JSON backup</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </div>
                <div class="setting-row focus-ring" style={{ cursor: "pointer" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">backup</span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Create Backup</span>
                    <span class="setting-row-desc">Full snapshot of your account data</span>
                  </div>
                  <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">chevron_right</span>
                </div>
              </div>
            </section>

            <section class="sec-section">
              <div class="insight-card">
                <div class="insight-card-header">
                  <div class="insight-card-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">info</span>
                  </div>
                  <p class="insight-card-title">How sync works</p>
                </div>
                <p class="insight-card-body">
                  Every change you make — adding a title, updating a rating, editing a note — is written to Supabase
                  instantly. If you go offline, changes queue locally and sync when you reconnect. Your data is
                  encrypted at rest and secured by Row-Level Security (only you can read your data).
                </p>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default SyncRoute;
