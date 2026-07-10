// src/routes/settings/privacy.tsx
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";

export default function PrivacyRoute() {
  return (
    <>
      <Title>CineLog — Privacy</Title>
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
            <h1 class="settings-title">Privacy</h1>
            <p class="settings-subtitle">Your data is yours. CineLog is personal, not social.</p>
          </div>
          <div class="settings-body">
            <div class="empty-premium">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                  lock
                </span>
              </div>
              <h3 class="empty-premium-title">Your Data Stays Yours</h3>
              <p class="empty-premium-body">
                CineLog is a single-player tracking app. Your watchlist, ratings, and profile
                are visible only to you. No followers, no public feed, no social graph.
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
