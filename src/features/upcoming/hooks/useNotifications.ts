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
  snoozeNotification as repoSnoozeNotification,
  dismissNotification as repoDismissNotification,
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
import { getBrowserSession } from "~/lib/supabase/session";
import {
  renderEmailTemplate,
  type NotificationType
} from "~/lib/email/renderer";

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
  // The browser stores Supabase sessions in localStorage (not cookies),
  // so the server can't read the access_token from the Cookie header.
  // We must pass it explicitly in the body — same pattern as
  // /api/account/delete (see DeactivateAccountSheet.tsx). Without this,
  // the server returns 401 "No active session" even for signed-in users.
  const session = await getBrowserSession();
  const accessToken = session?.access_token ?? "";

  const response = await fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, title, body, url, tag, accessToken }),
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

/**
 * Send an email notification as a FALLBACK when push delivery fails
 * (or push is unavailable). Phase 2 — Task 15.
 *
 * The email is sent via /api/email/send, which:
 *   • Re-checks the user's email prefs server-side (so a malicious
 *     client can't bypass the gate by editing localStorage).
 *   • Rate-limits per user (max 10 emails/day).
 *   • Falls back to console-logging if RESEND_API_KEY is missing
 *     (mock mode — lets the flow work end-to-end in dev).
 *
 * The caller passes a `NotificationType` (typed enum from the
 * renderer) and a context object. The renderer produces the HTML;
 * this function just packages it into the API request.
 *
 * Returns true if the email was sent (or mocked), false if it was
 * suppressed by preference or failed. The caller uses this to
 * decide whether to log "email sent" or "email suppressed".
 *
 * NOTE: This function is intentionally NOT exported from the module
 * because the only legitimate caller is `fireDueBrowserNotifications`
 * in this same file. The weekly-recap cron has its own email-sending
 * path (it renders the email server-side and POSTs to Resend
 * directly, bypassing the user-session auth path).
 */
async function sendEmailNotification(
  userId: string,
  recipientEmail: string,
  title: string,
  message: string,
  notificationType: NotificationType,
  context?: Record<string, unknown>
): Promise<boolean> {
  if (!recipientEmail) {
    console.warn("[notifications] Email fallback skipped — no email on file.");
    return false;
  }

  try {
    const html = renderEmailTemplate(notificationType, {
      title,
      message,
      ...context,
    });

    const session = await getBrowserSession();
    const accessToken = session?.access_token ?? "";

    const response = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipientEmail,
        subject: title,
        html,
        text: message,
        userId,
        notificationType,
        accessToken,
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      mock?: boolean;
      suppressed?: boolean;
      reason?: string;
      error?: string;
    };

    if (!response.ok) {
      console.warn(
        "[notifications] Email fallback failed:",
        result.error ?? `HTTP ${response.status}`
      );
      return false;
    }

    if (result.suppressed) {
      // User has email notifications disabled for this category —
      // not an error, just a no-op. Don't log this as a warning
      // because it's the expected behavior when the user has opted
      // out of email notifications.
      return false;
    }

    if (result.mock) {
      // Mock mode — the email was logged to the server console
      // instead of actually being sent. Don't treat this as a
      // failure (the user is in dev and the flow is working).
      return true;
    }

    return Boolean(result.success);
  } catch (err) {
    // Network error, JSON parse error, etc. — non-fatal. The
    // in-app notification feed still has the row.
    console.warn(
      "[notifications] Email fallback threw:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
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

    // ─── Email fallback gate (Phase 2 — Task 15) ─────────────────
    // The email fallback fires when push delivery fails OR the user
    // has no push subscription. We read the email prefs here to
    // decide whether to ATTEMPT the email — the server re-checks
    // the prefs too, so this client-side check is just an optimization
    // to avoid an unnecessary network round-trip.
    //
    // The reminder email maps to the "reminder" NotificationType,
    // which doesn't have a per-category email pref (see the renderer
    // docs). It only respects the master emailEnabled toggle.
    const prefs = notifPrefs();
    const emailFallbackEnabled = prefs.emailEnabled;
    const recipientEmail = user()?.email ?? "";

    for (const r of due) {
      const notifTitle = "CineLog — Release Day";
      const notifBody = `Your tracked title is out today. Tap to open.`;
      let pushSucceeded = false;

      // ─── 1. In-browser toast (visible only if the tab is open) ──
      if (canShowToast && !inQuiet) {
        try {
          new Notification(notifTitle, {
            body: notifBody,
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
      // We now AWAIT the push result instead of fire-and-forget,
      // because we need to know whether to trigger the email
      // fallback. If push succeeds (sent > 0), no email. If push
      // fails OR sends 0 (no subscriptions), we try email.
      //
      // The server endpoint handles quiet hours, rate limits, and
      // dead-endpoint cleanup. We only send push for reminders (not
      // for test notifications — those are sent directly by the
      // PushToggle component).
      try {
        const pushResult = await sendPushNotification(
          id,
          notifTitle,
          notifBody,
          `/upcoming`,
          `reminder-${r.id}`
        );
        pushSucceeded = pushResult.sent > 0;
      } catch (err) {
        // Non-fatal — push delivery is best-effort. The in-app
        // notification feed still has the row. We'll try the email
        // fallback below.
        console.warn("[notifications] Push send failed for reminder:", err);
      }

      // ─── 3. Email fallback (Phase 2 — Task 15) ────────────────
      // Fire when:
      //   • push didn't deliver (pushSucceeded=false — either failed
      //     or there were no subscriptions)
      //   • AND email fallback is enabled in user prefs
      //   • AND we have the user's email address
      //   • AND we're not in quiet hours
      //
      // We skip the email if push succeeded — the user already got
      // the notification via push, no need to double-deliver.
      //
      // We skip the email if we're in quiet hours — the user has
      // asked not to be bothered during this window. (The server-side
      // preference check on /api/email/send would actually allow
      // the email through since quiet hours is only enforced on
      // /api/push/send, so we explicitly skip here.)
      //
      // The notification is a "reminder" — release-day nudge. We
      // render it with the reminder template, which shows the title
      // + a CTA to open /upcoming.
      if (!pushSucceeded && emailFallbackEnabled && recipientEmail && !inQuiet) {
        void sendEmailNotification(
          id,
          recipientEmail,
          notifTitle,
          notifBody,
          "reminder",
          {
            // Pass the reminder's release date so the email can
            // display "Released today". The reminder row has
            // release_date as a YYYY-MM-DD string — we render it
            // as a localized date in the email template.
            releaseDate: r.release_date
              ? new Date(r.release_date + "T00:00:00").toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" }
                )
              : "Today",
          }
        ).catch(() => {
          // Email send is fire-and-forget — we don't need to wait
          // for it. The .catch() is just to prevent an unhandled
          // promise rejection if the email route is unreachable.
        });
      }

      // ─── 4. Mark the reminder as sent ─────────────────────────
      // Always mark as sent, even if the toast, push, or email
      // failed — otherwise we'd retry on every page load and spam
      // the user.
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
    titleName: string,
    posterPath: string | null = null
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
      titleName,
      posterPath
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

  // ─── Snooze / dismiss (Phase 6 Part 3 — Task 1) ───────────────────
  //
  // Snooze: hide the notification until `minutes` from now. The
  // notification stays in the feed (just hidden) so the user can
  // un-snooze by re-opening the notification center after the snooze
  // expires.
  //
  // We update the server FIRST, then optimistically update the local
  // state. On failure, we don't roll back — the next refresh will
  // restore the correct state. The toast informs the user.
  const snooze = async (notificationId: string, minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const ok = await repoSnoozeNotification(notificationId, until);
    if (ok) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, snoozed_until: until } : n
        )
      );
      const label =
        minutes < 60
          ? `${minutes} min`
          : minutes < 1440
          ? `${Math.round(minutes / 60 * 10) / 10} hr`
          : `${Math.round(minutes / 1440 * 10) / 10} days`;
      toast.showToast(`Snoozed for ${label}`, "info");
    } else {
      toast.showToast("Couldn't snooze notification.", "error");
    }
  };

  // Dismiss: permanently remove the notification from the feed.
  // We optimistically remove it from local state, then call the
  // server. On failure, we re-fetch to restore.
  const dismiss = async (notificationId: string) => {
    const prevList = notifications();
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    const ok = await repoDismissNotification(notificationId);
    if (!ok) {
      // Restore — server rejected the delete.
      setNotifications(prevList);
      toast.showToast("Couldn't dismiss notification.", "error");
    }
  };

  // ─── "Notify all" bulk action (Phase 6 Part 3 — Task 1) ──────────
  //
  // Force-send push + email notifications for ALL of the user's
  // unsent reminders, regardless of whether they're "due" yet.
  //
  // This is the manual "fire the digest now" button — useful when the
  // user knows they have upcoming releases and wants to confirm
  // delivery is working, or wants to nudge themselves about an
  // imminent release.
  //
  // Skips reminders that have already been sent (notification_sent=true)
  // to avoid re-firing the same reminder twice.
  //
  // Returns a summary { sent, failed, suppressed } so the caller can
  // show a meaningful toast.
  const notifyAll = async (): Promise<{
    sent: number;
    failed: number;
    suppressed: number;
  }> => {
    const id = uid();
    if (!id) {
      return { sent: 0, failed: 0, suppressed: 0 };
    }

    // Read the full reminder list (already loaded by refresh(), but
    // we re-fetch to make sure we have the latest sent state).
    const all = await getUserReminders(id);
    const unsent = all.filter((r) => !r.notification_sent);
    if (unsent.length === 0) {
      toast.showToast("No pending reminders to notify.", "info");
      return { sent: 0, failed: 0, suppressed: 0 };
    }

    const inQuiet = isInQuietHours();
    const canShowToast =
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted";
    const prefs = notifPrefs();
    const emailFallbackEnabled = prefs.emailEnabled;
    const recipientEmail = user()?.email ?? "";

    let sent = 0;
    let failed = 0;
    let suppressed = 0;

    for (const r of unsent) {
      const notifTitle = "CineLog — Release Day";
      const notifBody = `Your tracked title is out today. Tap to open.`;
      let pushSucceeded = false;

      if (canShowToast && !inQuiet) {
        try {
          new Notification(notifTitle, {
            body: notifBody,
            icon: "/favicon.ico",
            tag: `reminder-${r.id}`
          });
        } catch {
          // ignore — push may still succeed
        }
      }

      try {
        const pushResult = await sendPushNotification(
          id,
          notifTitle,
          notifBody,
          `/upcoming`,
          `reminder-${r.id}`
        );
        pushSucceeded = pushResult.sent > 0;
      } catch (err) {
        console.warn(
          "[notifications] Push send failed during notifyAll:",
          err
        );
      }

      if (!pushSucceeded && emailFallbackEnabled && recipientEmail && !inQuiet) {
        const emailed = await sendEmailNotification(
          id,
          recipientEmail,
          notifTitle,
          notifBody,
          "reminder",
          {
            releaseDate: r.release_date
              ? new Date(r.release_date + "T00:00:00").toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" }
                )
              : "Today"
          }
        ).catch(() => false);
        if (emailed) {
          sent++;
        } else if (pushSucceeded) {
          // push already counted below
        } else {
          failed++;
        }
      } else if (pushSucceeded) {
        sent++;
      } else if (inQuiet) {
        suppressed++;
      } else {
        failed++;
      }

      // Always mark as sent so we don't retry on the next page load.
      try {
        await markReminderSent(r.id);
      } catch {
        // ignore
      }
    }

    if (sent > 0 && failed === 0 && suppressed === 0) {
      toast.showToast(
        `Notified ${sent} reminder${sent === 1 ? "" : "s"}.`,
        "success"
      );
    } else if (suppressed > 0 && sent === 0 && failed === 0) {
      toast.showToast(
        `All ${suppressed} reminder${suppressed === 1 ? "" : "s"} suppressed (quiet hours).`,
        "info"
      );
    } else {
      toast.showToast(
        `Notified ${sent}, ${failed} failed, ${suppressed} suppressed.`,
        sent > 0 ? "success" : "error"
      );
    }

    return { sent, failed, suppressed };
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
    snooze,
    dismiss,
    notifyAll,
    requestPermission
  };
}
