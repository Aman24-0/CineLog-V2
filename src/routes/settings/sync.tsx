// src/routes/settings/sync.tsx
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";

export default function SyncRoute() {
  return (
    <>
      <Title>CineLog — Sync</Title>
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
            <h1 class="settings-title">Sync</h1>
            <p class="settings-subtitle">Your data syncs automatically via Supabase.</p>
          </div>
          <div class="settings-body">
            <div class="empty-premium">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                  sync
                </span>
              </div>
              <h3 class="empty-premium-title">Always in Sync</h3>
              <p class="empty-premium-body">
                Your watchlist and profile are stored securely in Supabase and sync across
                all your devices automatically. Import and export tools coming soon.
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
