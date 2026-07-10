// src/routes/settings/notifications.tsx
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";

export default function NotificationsRoute() {
  return (
    <>
      <Title>CineLog — Notifications</Title>
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
            <h1 class="settings-title">Notifications</h1>
            <p class="settings-subtitle">Manage how CineLog notifies you.</p>
          </div>
          <div class="settings-body">
            <div class="empty-premium">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                  notifications
                </span>
              </div>
              <h3 class="empty-premium-title">Coming Soon</h3>
              <p class="empty-premium-body">Push notification preferences will be available here.</p>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
