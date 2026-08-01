// src/features/settings/sections/NotificationSection.tsx
//
// Notifications section — push permission, 5 category toggles,
// quiet hours (toggle + start/end time), reminder lead time.
//
// Pure JSX extractor: receives the `SettingsState` bag for local state
// (push permission, requestPushPermission handler, handleCategoryToggle)
// and imports the global `notifPrefs` signal + `updateNotifPref` setter
// directly from `~/core/preferences`.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header.
//   • The inner panel:
//       - Push permission row (Enable / Blocked / Enabled / Unsupported)
//       - 5 category toggles (new season, continue watching, weekly
//         recap, recommendations, sync status)
//       - Quiet hours (enable toggle + start/end time inputs)
//       - Reminder lead time segmented control

import { Show, For } from "solid-js";
import type { SettingsState } from "./types";
import {
  ToggleRow,
  TimeRow,
  ControlRow,
  Segmented
} from "~/features/settings/sharedControls";

// Global preference signal + setter — imported directly.
import {
  notifPrefs,
  updateNotifPref
} from "~/core/preferences";

// Static option lists — single source of truth.
import {
  NOTIF_CATEGORIES,
  LEAD_TIME_OPTIONS
} from "~/shared/constants/settings";

export function NotificationSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show
      when={s.filteredSections().some(
        (sec) => sec.id === "notifications"
      )}
    >
      <section
        id="section-notifications"
        class="settings-accordion-section"
      >
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("notifications")}
          aria-expanded={s.isExpanded("notifications")}
          aria-controls="panel-notifications"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
          >
            notifications
          </span>
          <div class="settings-accordion-meta">
            <span class="settings-accordion-title">
              {s.highlightText("Notifications")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Push, categories, quiet hours")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("notifications")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("notifications")}>
          <div
            id="panel-notifications"
            class="settings-accordion-panel"
          >
            {/* Push permission */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">
                Push notifications
              </p>
              <div class="setting-group">
                <div class="setting-row-control">
                  <div class="setting-row-control-header">
                    <div
                      class="setting-row-icon"
                      aria-hidden="true"
                    >
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
                        Device permission
                      </span>
                      <span class="setting-row-control-desc">
                        <Show
                          when={s.pushPermission() !== "unsupported"}
                          fallback={
                            <span
                              style={{
                                color: "var(--text-muted)"
                              }}
                            >
                              Not supported in this browser.
                            </span>
                          }
                        >
                          <Show
                            when={s.pushPermission() === "granted"}
                            fallback={
                              <span
                                style={{
                                  color: "var(--text-muted)"
                                }}
                              >
                                Required for background reminders.
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
                    <Show when={s.pushPermission() === "default"}>
                      <button
                        type="button"
                        class="settings-link-btn focus-ring"
                        onClick={s.requestPushPermission}
                      >
                        Enable
                      </button>
                    </Show>
                    <Show when={s.pushPermission() === "denied"}>
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
            </div>

            {/* Categories */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Categories</p>
              <div class="setting-group">
                <For each={NOTIF_CATEGORIES}>
                  {(cat) => (
                    <ToggleRow
                      icon={cat.icon}
                      label={cat.label}
                      desc={cat.desc}
                      current={() =>
                        notifPrefs()[cat.key] as boolean
                      }
                      onChange={(v) =>
                        s.handleCategoryToggle(cat.key, v)
                      }
                    />
                  )}
                </For>
              </div>
            </div>

            {/* Quiet hours */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Quiet hours</p>
              <div class="setting-group">
                <ToggleRow
                  icon="do_not_disturb_on"
                  label="Enable quiet hours"
                  desc="Silence notifications during a time window."
                  current={() => notifPrefs().quietHoursEnabled}
                  onChange={(v) =>
                    updateNotifPref("quietHoursEnabled", v)
                  }
                />
                <Show when={notifPrefs().quietHoursEnabled}>
                  <TimeRow
                    icon="bedtime"
                    label="Start"
                    desc="When quiet hours begin."
                    value={() => notifPrefs().quietHoursStart}
                    onChange={(v) =>
                      updateNotifPref("quietHoursStart", v)
                    }
                  />
                  <TimeRow
                    icon="wb_sunny"
                    label="End"
                    desc="When quiet hours end."
                    value={() => notifPrefs().quietHoursEnd}
                    onChange={(v) =>
                      updateNotifPref("quietHoursEnd", v)
                    }
                  />
                </Show>
              </div>
            </div>

            {/* Reminder lead time */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">
                Reminder lead time
              </p>
              <div class="setting-group">
                <ControlRow
                  icon="alarm"
                  label="Episode reminders"
                  desc="How long before an episode airs."
                >
                  <Segmented
                    options={LEAD_TIME_OPTIONS}
                    current={() => notifPrefs().episodeReminderLead}
                    onChange={(id) =>
                      updateNotifPref("episodeReminderLead", id)
                    }
                    name="Reminder lead time"
                  />
                </ControlRow>
              </div>
            </div>
          </div>
        </Show>
      </section>
    </Show>
  );
}
