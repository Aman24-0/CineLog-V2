// src/core/preferences/calendar.ts
// Calendar Preferences

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";

export type FirstDayOfWeek = 0 | 1 | 6; // 0=Sun, 1=Mon, 6=Sat
export type TimeFormat = "12h" | "24h";
export type CalendarView = "week" | "month" | "agenda";

export interface CalendarPrefs {
  firstDayOfWeek: FirstDayOfWeek;
  timeFormat: TimeFormat;
  releaseTimezone: "local" | "us-east" | "us-pacific" | "utc";
  defaultView: CalendarView;
}

const CAL_PREFS_KEY = "cinelog_calendar_prefs";

const DEFAULT_CAL_PREFS: CalendarPrefs = {
  firstDayOfWeek: 1, // Monday (matches most of the world outside US)
  timeFormat: "24h",
  releaseTimezone: "local",
  defaultView: "week"
};

function readCalPrefs(): CalendarPrefs {
  if (isServer) return DEFAULT_CAL_PREFS;
  try {
    const raw = localStorage.getItem(CAL_PREFS_KEY);
    if (!raw) return DEFAULT_CAL_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CAL_PREFS, ...parsed };
  } catch {
    return DEFAULT_CAL_PREFS;
  }
}

export const [calPrefs, setCalPrefs] =
  createSignal<CalendarPrefs>(readCalPrefs());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(CAL_PREFS_KEY, JSON.stringify(calPrefs()));
  } catch {
    // ignore
  }
});

export function updateCalPref<K extends keyof CalendarPrefs>(
  key: K,
  value: CalendarPrefs[K]
): void {
  setCalPrefs((prev) => ({ ...prev, [key]: value }));
}

/** Format a time string ("HH:MM" or ISO) per user's 12/24h preference. */
export function formatTimeUser(timeStr: string): string {
  if (!timeStr) return "";
  const tf = calPrefs().timeFormat;
  // Parse "HH:MM"
  const m = /^(\d{2}):(\d{2})/.exec(timeStr);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2];
    if (tf === "12h") {
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${min} ${period}`;
    }
    return `${h.toString().padStart(2, "0")}:${min}`;
  }
  // ISO date string — extract time
  const d = new Date(timeStr);
  if (!isNaN(d.getTime())) {
    if (tf === "12h") {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
    }
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }
  return timeStr;
}
