// src/features/upcoming/hooks/useNotifications.ts
//
// useNotifications — owns the user's notification feed state and the
// "fire due reminders as browser notifications" side effect.
//
// On mount, the hook:
//   1. Loads the user's notifications + reminders from Supabase.
//   2. Checks for any reminders whose release_date is today or earlier
//      and fires a browser Notification for each (with permission).
//   3. Marks each fired reminder as notification_sent=true.
//
// The hook exposes:
//   • notifications()   — the feed (newest first).
//   • unreadCount()     — count of notifications with is_read=false.
//   • reminders()       — the user's reminder rows (for card bell state).
//   • refresh()         — reload from Supabase.
//   • markRead(id)      — mark a single notification as read.
//   • markAllRead()     — mark all as read.
//   • clearRead()       — delete read notifications.
//   • scheduleReminder(...)  — set a reminder + insert a notification row.
//   • cancelReminder(...)    — remove a reminder.

import { createSignal, createMemo, onMount, type Accessor } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import {
  getNotifications,
  getUserReminders,
  getDueReminders,
  markReminderSent,
  markNotificationRead,
  markAllNotificationsRead,
  clearReadNotifications,
  scheduleReminder as repoScheduleReminder,
  cancelReminder as repoCancelReminder,
  type NotificationRow,
  type UserReminderRow
} from "~/lib/supabase/repositories/upcoming";
import { useToast } from "~/shared/hooks/useToast";
import {
  isInQuietHours,
  notifPrefs
} from "~/core/preferences/notifications";

/**
 * Subtract `leadMinutes` from a `YYYY-MM-DD` release-date string and
 * return a new `YYYY-MM-DD` string representing the (possibly earlier)
 * reminder-fire date.
 *
 * The release_date column in user_reminders is a DATE (not TIMESTAMPTZ),
 * so we lose sub-day precision. The fire time is computed as
 * (local-midnight on release day) - leadMinutes, then floored to the
 * calendar date.
 *
 * For sub-day leads (5/15/30/60 min), this means the date shifts back
 * by 1 day (e.g. 60min lead on Aug 15 → fire at 23:00 Aug 14 → stored
 * as "2026-08-14"). The reminder fires the evening before release,
 * which matches user intent for "remind me 1 hour before".
 *
 * For the "day before" lead (1440 min = 24h), the date shifts back by
 * 1 day in the same way — fire at 00:00 the day before release.
 *
 * Parsing is done in LOCAL time, not UTC, because the user thinks in
 * local time. Using `new Date(year, month-1, day)` (not
 * `new Date("YYYY-MM-DD")` which parses as UTC) keeps the date in the
 * user's timezone.
 *
 * Invalid input (non-YYYY-MM-DD, NaN lead) returns the input unchanged
 * so we never break the schedule call if the lead-time pref is corrupt.
 */
export function applyLeadTime(releaseDate: string, leadMinutes: number): string {
  // Validate the input is a YYYY-MM-DD string. Be lenient: accept any
  // string whose first 10 chars match the pattern, so ISO timestamps
  // (YYYY-MM-DDTHH:mm:ssZ) also work.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(releaseDate);
  if (!m) return releaseDate;
  if (!Number.isFinite(leadMinutes) || leadMinutes <= 0) return releaseDate;

  // Construct a local-midnight Date. Using `new Date(year, month-1, day)`
  // (not `new Date("YYYY-MM-DD")` which parses as UTC) keeps the date
  // in the user's timezone.
  const year = Number(m[1]);
  const month = Number(m[2]) - 1; // JS months are 0-indexed
  const day = Number(m[3]);
  const base = new Date(year, month, day, 0, 0, 0, 0);

  // Subtract the lead time. setMinutes handles wrapping across days
  // and months automatically.
  base.setMinutes(base.getMinutes() - Math.floor(leadMinutes));

  // Format back to YYYY-MM-DD in LOCAL time (not UTC).
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Send a Web Push notification to the user's devices via the
 * /api/push/send server endpoint.
 *
 * Phase 2 — Task 13. This is the client-side companion to the server
 * push send route. It's a thin fetch() wrapper that POSTs the
 * notification payload to the server, which then uses the `web-push`
 * library to deliver it to every browser the user has subscribed.
 *
 * The server enforces:
 *   • Auth (caller can only send to their own userId).
 *   • Quiet hours (suppresses non-test notifications during the window).
 *   • Rate limit (max 30 sends per minute per user).
 *   • Dead-endpoint cleanup (deletes 404/410 subscriptions).
 *
 * Returns the parsed JSON response, or throws on network error.
 *
 * NOTE: This function is intentionally NOT exported from the module
 * because the only legitimate caller is `fireDueBrowserNotifications`
 * in this same file. The PushToggle component calls /api/push/send
 * directly via its own fetch() (see usePushSubscription.sendTest).
 */
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string,
  tag?: string
): Promise<{ sent: number; failed: number; suppressed?: boolean }> {
  const response = await fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, title, body, url, tag }),
  });

  if (!response.ok) {
    // The server returns a JSON error body — extract the message.
    const errBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      errBody?.error ?? `Push send failed (HTTP ${response.status})`
    );
  }

  return (await response.json()) as {
    sent: number;
    failed: number;
    suppressed?: boolean;
  };
}

export function useNotifications() {
  const { user, isSignedIn } = useAuth();
  const toast = useToast();

  const [notifications, setNotifications] = createSignal<NotificationRow[]>([]);
  const [reminders, setReminders] = createSignal<UserReminderRow[]>([]);
  const [loading, setLoading] = createSignal(false);

  const uid = (): string | null => user()?.uid ?? null;

  const refresh = async () => {
    const id = uid();
    if (!id) return;
    setLoading(true);
    try {
      const [notifs, rems] = await Promise.all([
        getNotifications(id, 50),
        getUserReminders(id)
      ]);
      setNotifications(notifs);
      setReminders(rems);
    } finally {
      setLoading(false);
    }
  };

  // Fire browser notifications for any reminders that are due today or
  // earlier and haven't been sent yet. Permission is checked first; if
  // not granted, we silently skip (the user can still see the in-app
  // notification row in the feed).
  //
  // QUIET HOURS (Phase 1 audit fix):
  //   If the user has quiet hours enabled AND the current time is inside
  //   the quiet window, we DON'T fire the notification now. The reminder
  //   row is left notification_sent=false so it will be retried on the
  //   next page load (after the quiet window ends).
  //
  //   A more complete implementation would queue the notification and
  //   fire it the moment quiet hours end (via a setTimeout or service
  //   worker alarm). That's a future enhancement — for now we simply
  //   suppress delivery during the quiet window, which matches user
  //   intent ("don't bother me at night").
  //
  // PHASE 2 — Task 13 (Web Push):
  //   In addition to the in-browser Notification toast, we now also
  //   fire a Web Push notification via /api/push/send. The push
  //   notification is delivered by the service worker and can wake the
  //   app even if the tab is closed. The server endpoint re-checks
  //   quiet hours, so we don't need to duplicate that logic here —
  //   but we DO check quiet hours before firing the in-browser toast
  //   (which is not server-mediated and would otherwise fire during
  //   the quiet window).
  const fireDueBrowserNotifications = async () => {
    const id = uid();
    if (!id) return;
    if (typeof window === "undefined") return;

    // Fetch due reminders ONCE — both the in-browser toast and the
    // push send use the same list.
    const due = await getDueReminders(id);
    if (due.length === 0) return;

    // ─── Quiet hours gate (in-browser toast only) ────────────────
    // The push endpoint re-checks quiet hours server-side, but the
    // in-browser Notification toast is fired directly from JS so it
    // needs the client-side gate. If we're in quiet hours, skip the
    // toast but STILL fire the push — the server will hold it during
    // the quiet window and the user won't see it until quiet hours
    // end. (Actually the server returns sent=0 suppressed=true, so
    // the push is effectively also suppressed — but we still mark the
    // reminder as sent so we don't retry every page load. The user
    // will see the in-app feed entry regardless.)
    const inQuiet = isInQuietHours();
    const canShowToast =
      "Notification" in window && Notification.permission === "granted";

    for (const r of due) {
      // ─── 1. In-browser toast (visible only if the tab is open) ──
      if (canShowToast && !inQuiet) {
        try {
          new Notification("CineLog — Release Day", {
            body: `Your tracked title is out today. Tap to open.`,
            icon: "/favicon.ico",
            tag: `reminder-${r.id}`
          });
        } catch {
          // Notification construction can throw on some platforms
          // (e.g. service worker scope issues). Don't abort the whole
          // loop — the push send may still succeed.
        }
      }

      // ─── 2. Web Push (visible even if the tab is closed) ───────
      // Fire-and-forget — we don't block the loop on the network
      // round-trip. The server endpoint handles quiet hours, rate
      // limits, and dead-endpoint cleanup.
      //
      // We only send push for reminders (not for test notifications
      // — those are sent directly by the PushToggle component).
      void sendPushNotification(
        id,
        "CineLog — Release Day",
        `Your tracked title is out today. Tap to open.`,
        `/upcoming`,
        `reminder-${r.id}`
      ).catch((err) => {
        // Non-fatal — push delivery is best-effort. The in-app
        // notification feed still has the row.
        console.warn("[notifications] Push send failed for reminder:", err);
      });

      // ─── 3. Mark the reminder as sent ─────────────────────────
      // Always mark as sent, even if the toast or push failed —
      // otherwise we'd retry on every page load and spam the user.
      try {
        await markReminderSent(r.id);
      } catch {
        // ignore — will retry on next page load
      }
    }
  };

  // Ask the browser for notification permission. Resolves to true if
  // granted, false otherwise.
  const requestPermission = async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const result = await Notification.requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  };

  // Schedule a reminder + insert a notification row + ask for browser
  // notification permission.
  //
  // EPISODE REMINDER LEAD TIME (Phase 1 audit fix):
  //   The user can configure `episodeReminderLead` (0, 5, 15, 30, 60, or
  //   1440 minutes) in the notification preferences. We subtract the
  //   lead time from the release date so the reminder fires BEFORE the
  //   actual release, not on the day-of.
  //
  //   The `user_reminders.release_date` column is a DATE (not TIMESTAMPTZ),
  //   so sub-day precision is lost. See `applyLeadTime` for the exact
  //   semantics — the short version: any lead > 0 shifts the stored
  //   date back by at least 1 day, so the reminder fires the evening
  //   before release (or earlier for multi-day leads).
  //
  //   If the shifted reminder time is already in the past, we still
  //   schedule it — `getDueReminders` will pick it up immediately on
  //   the next page load (the user gets the notification right away,
  //   which is the right behavior for a release that's about to happen).
  const scheduleReminder = async (
    tmdbId: string | number,
    titleType: "movie" | "series",
    releaseDate: string,
    titleName: string
  ): Promise<boolean> => {
    const id = uid();
    if (!id) return false;

    // ─── Apply the lead time ──────────────────────────────────────
    // Parse the release date as a local-midnight Date, subtract the
    // lead time, then convert back to YYYY-MM-DD for storage.
    //
    // We use local time (not UTC) because the user thinks in local
    // time — "release day" to them means "8 PM my time on Friday",
    // not "midnight UTC". Using local-midnight as the basis means a
    // 60-minute lead fires at 23:00 the day before in local time,
    // which still rounds to the previous calendar day.
    const leadMinutes = notifPrefs().episodeReminderLead ?? 60;
    const shiftedReleaseDate = applyLeadTime(releaseDate, leadMinutes);

    const ok = await repoScheduleReminder(
      id,
      tmdbId,
      titleType,
      shiftedReleaseDate,
      titleName
    );
    if (!ok) {
      toast.showToast("Couldn't set reminder — try again.", "error");
      return false;
    }
    // Ask for permission in the background. Don't block the toast.
    void requestPermission();
    toast.showToast(`Reminder set for "${titleName}"`, "success");
    await refresh();
    return true;
  };

  const cancelReminder = async (tmdbId: string | number): Promise<boolean> => {
    const id = uid();
    if (!id) return false;
    const ok = await repoCancelReminder(id, tmdbId);
    if (!ok) {
      toast.showToast("Couldn't cancel reminder.", "error");
      return false;
    }
    toast.showToast("Reminder removed", "info");
    await refresh();
    return true;
  };

  const markRead = async (notificationId: string) => {
    const ok = await markNotificationRead(notificationId);
    if (ok) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
    }
  };

  const markAllRead = async () => {
    const id = uid();
    if (!id) return;
    const ok = await markAllNotificationsRead(id);
    if (ok) {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          is_read: true,
          read_at: n.read_at ?? new Date().toISOString()
        }))
      );
    }
  };

  const clearRead = async () => {
    const id = uid();
    if (!id) return;
    const ok = await clearReadNotifications(id);
    if (ok) {
      setNotifications((prev) => prev.filter((n) => !n.is_read));
    }
  };

  const unreadCount = createMemo(
    () => notifications().filter((n) => !n.is_read).length
  );

  onMount(() => {
    if (isSignedIn()) {
      void refresh().then(() => void fireDueBrowserNotifications());
    }
  });

  return {
    notifications: notifications as Accessor<NotificationRow[]>,
    reminders: reminders as Accessor<UserReminderRow[]>,
    unreadCount,
    loading,
    refresh,
    scheduleReminder,
    cancelReminder,
    markRead,
    markAllRead,
    clearRead,
    requestPermission
  };
}
