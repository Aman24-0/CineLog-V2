// src/features/settings/sections/CalendarSection.tsx
//
// Calendar section — first day of week, time format, timezone,
// default calendar view.
//
// Pure JSX extractor: receives the `SettingsState` bag for the
// `renderSegmented` helper + accordion UI helpers, and imports the
// global `calPrefs` signal + `updateCalPref` setter directly from
// `~/core/preferences`.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header.
//   • The inner panel:
//       - First day of week segmented control
//       - Time format segmented control (12h / 24h)
//       - Timezone select (with TZ_OPTIONS)
//       - Default calendar view segmented control

import { Show } from "solid-js";
import type { SettingsState } from "./types";
import {
  SelectRow,
  ControlRow
} from "~/features/settings/sharedControls";

// Global preference signal + setter + types — imported directly.
import {
  calPrefs,
  updateCalPref,
  type CalendarPrefs
} from "~/core/preferences";

// Static option lists — single source of truth.
import {
  FIRST_DAY_OPTIONS,
  TIME_FORMAT_OPTIONS,
  DEFAULT_VIEW_OPTIONS,
  TZ_OPTIONS
} from "~/shared/constants/settings";

export function CalendarSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show when={s.filteredSections().some((sec) => sec.id === "calendar")}>
      <section
        id="section-calendar"
        class="settings-accordion-section"
      >
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("calendar")}
          aria-expanded={s.isExpanded("calendar")}
          aria-controls="panel-calendar"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
          >
            calendar_month
          </span>
          <div class="settings-accordion-meta">
            <span class="settings-accordion-title">
              {s.highlightText("Calendar")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Week, time format, timezone")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("calendar")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("calendar")}>
          <div
            id="panel-calendar"
            class="settings-accordion-panel"
          >
            <div class="setting-subsection">
              <p class="setting-subsection-label">
                First day of week
              </p>
              <div class="setting-group">
                <ControlRow
                  icon="view_week"
                  label="Week starts on"
                  desc="First day of the week row."
                >
                  {s.renderSegmented(
                    FIRST_DAY_OPTIONS,
                    () => calPrefs().firstDayOfWeek,
                    (id) => updateCalPref("firstDayOfWeek", id),
                    "First day of week"
                  )}
                </ControlRow>
              </div>
            </div>

            <div class="setting-subsection">
              <p class="setting-subsection-label">Time format</p>
              <div class="setting-group">
                <ControlRow
                  icon="schedule"
                  label="12-hour or 24-hour"
                  desc="How air times are shown."
                >
                  {s.renderSegmented(
                    TIME_FORMAT_OPTIONS,
                    () => calPrefs().timeFormat,
                    (id) => updateCalPref("timeFormat", id),
                    "Time format"
                  )}
                </ControlRow>
              </div>
            </div>

            <div class="setting-subsection">
              <p class="setting-subsection-label">Timezone</p>
              <div class="setting-group">
                <SelectRow
                  icon="public"
                  label="Air time timezone"
                  desc="Convert air times to your timezone."
                  value={() => calPrefs().releaseTimezone}
                  onChange={(v) =>
                    updateCalPref(
                      "releaseTimezone",
                      v as CalendarPrefs["releaseTimezone"]
                    )
                  }
                  options={TZ_OPTIONS}
                />
              </div>
            </div>

            <div class="setting-subsection">
              <p class="setting-subsection-label">Default view</p>
              <div class="setting-group">
                <ControlRow
                  icon="calendar_view_week"
                  label="Calendar opens to"
                  desc="Which view the calendar starts on."
                >
                  {s.renderSegmented(
                    DEFAULT_VIEW_OPTIONS,
                    () => calPrefs().defaultView,
                    (id) => updateCalPref("defaultView", id),
                    "Default calendar view"
                  )}
                </ControlRow>
              </div>
            </div>
          </div>
        </Show>
      </section>
    </Show>
  );
}
