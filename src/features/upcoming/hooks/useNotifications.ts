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

import {
  createSignal,
  createMemo,
  onMount,
  type Accessor,
} from "solid-js";
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
  type UserReminderRow,
} from "~/lib/supabase/repositories/upcoming";
import { useToast } from "~/shared/hooks/useToast";

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
        getUserReminders(id),
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
  const fireDueBrowserNotifications = async () => {
    const id = uid();
    if (!id) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const due = await getDueReminders(id);
    for (const r of due) {
      try {
        new Notification("CineLog — Release Day", {
          body: `Your tracked title is out today. Tap to open.`,
          icon: "/favicon.ico",
          tag: `reminder-${r.id}`,
        });
        await markReminderSent(r.id);
      } catch {
        // Notification construction can throw on some platforms (e.g.
        // service worker scope issues). Mark as sent so we don't retry
        // in a tight loop.
        await markReminderSent(r.id);
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
  const scheduleReminder = async (
    tmdbId: string | number,
    titleType: "movie" | "series",
    releaseDate: string,
    titleName: string,
  ): Promise<boolean> => {
    const id = uid();
    if (!id) return false;
    const ok = await repoScheduleReminder(
      id,
      tmdbId,
      titleType,
      releaseDate,
      titleName,
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
            : n,
        ),
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
          read_at: n.read_at ?? new Date().toISOString(),
        })),
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

  const unreadCount = createMemo(() => notifications().filter((n) => !n.is_read).length);

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
    requestPermission,
  };
}
