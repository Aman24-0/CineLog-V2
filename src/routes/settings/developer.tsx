// src/routes/settings/developer.tsx
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";

export default function DeveloperRoute() {
  return (
    <>
      <Title>CineLog — Developer</Title>
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
            <h1 class="settings-title">Developer</h1>
            <p class="settings-subtitle">Debug and diagnostic options.</p>
          </div>
          <div class="settings-body">
            <div class="empty-premium">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                  code
                </span>
              </div>
              <h3 class="empty-premium-title">Developer Options</h3>
              <p class="empty-premium-body">
                Debug toggles, cache inspection, and diagnostic tools will be available here.
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
