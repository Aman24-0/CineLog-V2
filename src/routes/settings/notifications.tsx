// src/routes/settings/notifications.tsx
//
// Notifications — fully redesigned with REAL persistence + advanced controls.
//
// Controls:
//   • Per-category toggles (new season, continue watching, weekly recap, recommendations, sync status)
//   • Quiet hours (toggle + start/end time)
//   • Weekly digest (day of week + time)
//   • Episode reminder lead time
//   • Browser notification permission request
//
// All preferences are persisted via src/core/preferences (notifPrefs signal).
// In-app toasts use the existing useToast system. Browser push requires
// user permission + service worker registration (requested on first toggle-on).

import { Title } from "@solidjs/meta";
import { Show, For, createSignal, onMount, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import {
  ToggleRow,
  TimeRow,
  SelectRow,
  ControlRow,
  Segmented
} from "~/features/settings/sharedControls";
import { useToast } from "~/shared/hooks/useToast";
import {
  notifPrefs,
  updateNotifPref,
  isInQuietHours
} from "~/core/preferences";
import {
  NOTIF_CATEGORIES,
  LEAD_TIME_OPTIONS,
  type NotifCategoryDef
} from "~/shared/constants/settings";
const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" }
];

const NotificationsRoute: Component = () => {
  const { showToast } = useToast();
  const [pushPermission, setPushPermission] = createSignal<
    NotificationPermission | "unsupported"
  >("default");

  onMount(() => {
    if (typeof Notification === "undefined") {
      setPushPermission("unsupported");
    } else {
      setPushPermission(Notification.permission);
    }
  });

  const requestPushPermission = async () => {
    if (typeof Notification === "undefined") {
      showToast(
        "Browser push notifications are not supported in this browser.",
        "error"
      );
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === "granted") {
        showToast("Push notifications enabled.", "success");
        // Fire a welcome notification
        new Notification("CineLog notifications enabled", {
          body: "You'll now get reminders for new seasons, weekly recaps, and more."
        });
      } else if (perm === "denied") {
        showToast(
          "Push notifications blocked. Update your browser settings to allow.",
          "error"
        );
      } else {
        showToast("Push notification permission not granted.", "info");
      }
    } catch (e) {
      console.error("[notifications] permission request failed:", e);
      showToast("Could not request push permission.", "error");
    }
  };

  const handleCategoryToggle = (
    key: NotifCategoryDef["key"],
    value: boolean
  ) => {
    updateNotifPref(key, value);
    // If user is enabling any category for the first time, prompt for push permission
    if (value && pushPermission() === "default") {
      void requestPushPermission();
    }
    showToast(
      value
        ? `${NOTIF_CATEGORIES.find((c) => c.key === key)?.label} enabled`
        : "Notification disabled",
      "info",
      1200
    );
  };

  const currentlyInQuietHours = () => isInQuietHours();

  return (
    <>
      <Title>CineLog — Notifications</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a
              href="/settings"
              class="sec-back focus-ring"
              aria-label="Back to settings"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "14px" }}
                aria-hidden="true"
              >
                arrow_back
              </span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Notifications</h1>
            <p class="sec-subtitle">
              Choose what CineLog tells you, and when. All preferences are saved
              and respected.
            </p>
          </div>

          <div class="sec-body">
            {/* Push permission status */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Device Permission</p>
              <div class="setting-group">
                <div class="setting-row-control">
                  <div class="setting-row-control-header">
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "16px" }}
                        aria-hidden="true"
                      >
                        notifications_active
                      </span>
                    </div>
                    <div class="setting-row-control-meta">
                      <span class="setting-row-control-label">
                        Browser push notifications
                      </span>
                      <span class="setting-row-control-desc">
                        <Show
                          when={pushPermission() !== "unsupported"}
                          fallback={
                            <span style={{ color: "var(--text-muted)" }}>
                              Not supported in this browser.
                            </span>
                          }
                        >
                          <Show
                            when={pushPermission() === "granted"}
                            fallback={
                              <span style={{ color: "var(--text-muted)" }}>
                                Required for reminders when the app is in the background.
                              </span>
                            }
                          >
                            <span style={{ color: "#4ade80" }}>
                              ✓ Enabled
                            </span>
                          </Show>
                        </Show>
                      </span>
                    </div>
                    <Show when={pushPermission() === "default"}>
                      <button
                        type="button"
                        class="settings-link-btn focus-ring"
                        onClick={requestPushPermission}
                      >
                        Enable
                      </button>
                    </Show>
                    <Show when={pushPermission() === "denied"}>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          "font-size": "0.75rem"
                        }}
                      >
                        Blocked
                      </span>
                    </Show>
                  </div>
                </div>
              </div>
            </section>

            {/* Per-category toggles */}
            <section class="sec-section">
              <p class="sec-section-label">Categories</p>
              <div class="setting-group">
                <For each={NOTIF_CATEGORIES}>
                  {(cat) => (
                    <ToggleRow
                      icon={cat.icon}
                      label={cat.label}
                      desc={cat.desc}
                      current={() => notifPrefs()[cat.key] as boolean}
                      onChange={(v) => handleCategoryToggle(cat.key, v)}
                    />
                  )}
                </For>
              </div>
            </section>

            {/* Quiet hours */}
            <section class="sec-section">
              <p class="sec-section-label">Quiet Hours</p>
              <div class="setting-group">
                <ToggleRow
                  icon="do_not_disturb_on"
                  label="Enable quiet hours"
                  desc="Silence all notifications during this time window."
                  current={() => notifPrefs().quietHoursEnabled}
                  onChange={(v) => updateNotifPref("quietHoursEnabled", v)}
                />
                <Show when={notifPrefs().quietHoursEnabled}>
                  <TimeRow
                    icon="bedtime"
                    label="Quiet hours start"
                    desc="When the silent window begins."
                    value={() => notifPrefs().quietHoursStart}
                    onChange={(v) => updateNotifPref("quietHoursStart", v)}
                  />
                  <TimeRow
                    icon="wb_sunny"
                    label="Quiet hours end"
                    desc="When the silent window ends."
                    value={() => notifPrefs().quietHoursEnd}
                    onChange={(v) => updateNotifPref("quietHoursEnd", v)}
                  />
                  <Show when={currentlyInQuietHours()}>
                    <div
                      class="info-callout"
                      style={{ margin: "var(--sp-3) var(--sp-5)" }}
                    >
                      <span
                        class="material-symbols-outlined info-callout-icon"
                        style={{ "font-size": "16px" }}
                        aria-hidden="true"
                      >
                        nightlight
                      </span>
                      <p class="info-callout-body">
                        <strong>You're currently in quiet hours.</strong> No
                        notifications will fire until{" "}
                        {notifPrefs().quietHoursEnd}.
                      </p>
                    </div>
                  </Show>
                </Show>
              </div>
            </section>

            {/* Weekly digest */}
            <section class="sec-section">
              <p class="sec-section-label">Weekly Recap</p>
              <div class="setting-group">
                <SelectRow
                  icon="event"
                  label="Day of week"
                  desc="Which day your weekly recap fires."
                  value={() => String(notifPrefs().weeklyDigestDay)}
                  onChange={(v) =>
                    updateNotifPref("weeklyDigestDay", parseInt(v, 10))
                  }
                  options={DAY_OF_WEEK_OPTIONS}
                />
                <TimeRow
                  icon="schedule"
                  label="Time of day"
                  desc="When the recap notification is sent."
                  value={() => notifPrefs().weeklyDigestTime}
                  onChange={(v) => updateNotifPref("weeklyDigestTime", v)}
                />
              </div>
            </section>

            {/* Episode reminder lead time */}
            <section class="sec-section">
              <p class="sec-section-label">Episode Reminders</p>
              <div class="setting-group">
                <ControlRow
                  icon="alarm"
                  label="Reminder lead time"
                  desc="How long before an episode airs to be reminded."
                >
                  <Segmented
                    options={LEAD_TIME_OPTIONS}
                    current={() => notifPrefs().episodeReminderLead}
                    onChange={(id) =>
                      updateNotifPref("episodeReminderLead", id)
                    }
                    name="Episode reminder lead time"
                  />
                </ControlRow>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default NotificationsRoute;
