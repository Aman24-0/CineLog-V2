// src/routes/settings/calendar.tsx
//
// Calendar preferences — first day of week, time format, release timezone, default view.
//
// All preferences are persisted via src/core/preferences (calPrefs signal).

import { Title } from "@solidjs/meta";
import { type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import {
  ControlRow,
  Segmented,
  SelectRow
} from "~/features/settings/sharedControls";
import {
  calPrefs,
  updateCalPref,
  type CalendarPrefs
} from "~/core/preferences";
import {
  FIRST_DAY_OPTIONS,
  TIME_FORMAT_OPTIONS,
  DEFAULT_VIEW_OPTIONS,
  TZ_OPTIONS
} from "~/shared/constants/settings";

const CalendarRoute: Component = () => {
  return (
    <>
      <Title>CineLog — Calendar</Title>
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
            <h1 class="sec-title">Calendar</h1>
            <p class="sec-subtitle">
              How upcoming releases and air times are shown on the Upcoming
              page.
            </p>
          </div>

          <div class="sec-body">
            {/* Week */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Week</p>
              <div class="setting-group">
                <ControlRow
                  icon="view_week"
                  label="First day of week"
                  desc="Week rows start on this day."
                >
                  <Segmented
                    options={FIRST_DAY_OPTIONS}
                    current={() => calPrefs().firstDayOfWeek}
                    onChange={(id) => updateCalPref("firstDayOfWeek", id)}
                    name="First day of week"
                  />
                </ControlRow>
              </div>
            </section>

            {/* Time format */}
            <section class="sec-section">
              <p class="sec-section-label">Time Format</p>
              <div class="setting-group">
                <ControlRow
                  icon="schedule"
                  label="12-hour or 24-hour"
                  desc="How air times are displayed."
                >
                  <Segmented
                    options={TIME_FORMAT_OPTIONS}
                    current={() => calPrefs().timeFormat}
                    onChange={(id) => updateCalPref("timeFormat", id)}
                    name="Time format"
                  />
                </ControlRow>
              </div>
            </section>

            {/* Release timezone */}
            <section class="sec-section">
              <p class="sec-section-label">Release Timezone</p>
              <div class="setting-group">
                <SelectRow
                  icon="schedule_send"
                  label="Air time timezone"
                  desc="Shows air times in your local timezone."
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
            </section>

            {/* Default view */}
            <section class="sec-section">
              <p class="sec-section-label">Default View</p>
              <div class="setting-group">
                <ControlRow
                  icon="calendar_view_week"
                  label="Default calendar view"
                  desc="Which view the Upcoming page opens to."
                >
                  <Segmented
                    options={DEFAULT_VIEW_OPTIONS}
                    current={() => calPrefs().defaultView}
                    onChange={(id) => updateCalPref("defaultView", id)}
                    name="Default calendar view"
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

export default CalendarRoute;
