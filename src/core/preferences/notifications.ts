// src/core/preferences/notifications.ts
// Notification Preferences (persisted)
// Per-category toggles + quiet hours + digest time + lead time

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";

export interface NotificationPrefs {
  newSeason: boolean;
  continueWatching: boolean;
  weeklyRecap: boolean;
  recommendations: boolean;
  syncStatus: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00" HH:MM
  quietHoursEnd: string; // "07:00" HH:MM
  weeklyDigestTime: string; // "09:00" HH:MM — when the weekly digest fires
  weeklyDigestDay: number; // 0=Sun, 1=Mon, ..., 6=Sat
  episodeReminderLead: number; // minutes before air time (0, 5, 15, 30, 60, 1440=day before)
}

const NOTIF_PREFS_KEY = "cinelog_notification_prefs";

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  newSeason: true,
  continueWatching: false,
  weeklyRecap: true,
  recommendations: false,
  syncStatus: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  weeklyDigestTime: "09:00",
  weeklyDigestDay: 1, // Monday
  episodeReminderLead: 60, // 1 hour before
};

function readNotifPrefs(): NotificationPrefs {
  if (isServer) return DEFAULT_NOTIF_PREFS;
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return DEFAULT_NOTIF_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_NOTIF_PREFS, ...parsed };
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export const [notifPrefs, setNotifPrefs] = createSignal<NotificationPrefs>(readNotifPrefs());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(notifPrefs()));
  } catch {
    // ignore
  }
});

export function updateNotifPref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]): void {
  setNotifPrefs((prev) => ({ ...prev, [key]: value }));
}

/** Check if a given Date is inside the user's quiet hours window. */
export function isInQuietHours(date: Date = new Date()): boolean {
  const p = notifPrefs();
  if (!p.quietHoursEnabled) return false;
  const cur = date.getHours() * 60 + date.getMinutes();
  const [sh, sm] = p.quietHoursStart.split(":").map(Number);
  const [eh, em] = p.quietHoursEnd.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) {
    return cur >= start && cur < end;
  }
  // wraps midnight
  return cur >= start || cur < end;
}
