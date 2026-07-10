// src/routes/settings/notifications.tsx
import { Title } from "@solidjs/meta";
import { For, createSignal, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";

interface NotifDef {
  id: string;
  label: string;
  desc: string;
  icon: string;
}

const NOTIFS: NotifDef[] = [
  { id: "new-season", label: "New Season Available", desc: "When a series in your watchlist gets a new season", icon: "new_releases" },
  { id: "continue-watching", label: "Continue Watching", desc: "Gentle reminders to resume in-progress titles", icon: "play_circle" },
  { id: "weekly-recap", label: "Weekly Recap", desc: "A summary of your watching activity each week", icon: "insights" },
  { id: "recommendations", label: "Recommendations", desc: "When Discover has new picks based on your taste", icon: "auto_awesome" },
  { id: "sync-status", label: "Sync Status", desc: "When your data syncs or a sync error occurs", icon: "sync" },
];

const NotificationsRoute: Component = () => {
  const [enabled, setEnabled] = createSignal<Record<string, boolean>>({
    "new-season": true,
    "continue-watching": false,
    "weekly-recap": true,
    "recommendations": false,
    "sync-status": true,
  });

  const toggle = (id: string) => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <Title>CineLog — Notifications</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_back</span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Notifications</h1>
            <p class="sec-subtitle">Choose what CineLog tells you. Every notification is explained.</p>
          </div>

          <div class="sec-body">
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Notifications</p>
              <div class="setting-group">
                <For each={NOTIFS}>
                  {(notif) => (
                    <div class="setting-row" style={{ cursor: "pointer" }} onClick={() => toggle(notif.id)}>
                      <div class="setting-row-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">{notif.icon}</span>
                      </div>
                      <div class="setting-row-text">
                        <span class="setting-row-label">{notif.label}</span>
                        <span class="setting-row-desc">{notif.desc}</span>
                      </div>
                      <div
                        class="toggle"
                        data-on={enabled()[notif.id] ?? false}
                        role="switch"
                        aria-checked={enabled()[notif.id] ?? false}
                        aria-label={notif.label}
                      >
                        <div class="toggle-knob" />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </section>

            <section class="sec-section">
              <div class="insight-card">
                <div class="insight-card-header">
                  <div class="insight-card-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">info</span>
                  </div>
                  <p class="insight-card-title">How notifications work</p>
                </div>
                <p class="insight-card-body">
                  CineLog is a personal app — notifications are reminders for <strong>you</strong>, not social pings.
                  They appear as in-app toasts and (when enabled) as device notifications. No emails, no spam, no followers.
                </p>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default NotificationsRoute;
