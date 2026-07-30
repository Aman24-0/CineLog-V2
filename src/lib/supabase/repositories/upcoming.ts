// src/lib/supabase/repositories/upcoming.ts
//
// Upcoming Page — Supabase persistence layer.
//
// Two tables (defined in supabase/migrations/20260801_add_upcoming_notifications.sql):
//   • notifications     — the in-app notification feed.
//   • user_reminders    — the user's "Remind Me" subscriptions.
//
// Both are owner-only via RLS (user_id = auth.uid()). Every function
// here is defensive: it returns an empty array / false on error so the
// Upcoming page degrades gracefully when the tables don't exist yet
// (e.g. before the user runs the migration) or when Supabase is
// unreachable.
//
// The TMDB-side fetch (getUpcomingTitles) is NOT in this file — it
// lives in ~/core/tmdb/discover and is composed by the
// useUpcomingData hook. This module only owns Supabase state.

import { getClient } from "~/lib/supabase/client";
import type { TMDBTitle } from "~/shared/types";
import {
  discoverMovies,
  discoverTv,
} from "~/core/tmdb/discover";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "reminder"
  | "watchlist_added"
  | "season_available"
  | "info";

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  related_title_id: string | null;
  related_title_type: "movie" | "series" | "episode" | null;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  is_read: boolean;
}

export interface UserReminderRow {
  id: string;
  user_id: string;
  tmdb_id: string;
  title_type: "movie" | "series";
  release_date: string;
  is_scheduled: boolean;
  notification_sent: boolean;
  created_at: string;
}

export interface UpcomingQueryParams {
  region: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  genres?: number[]; // TMDB genre IDs
  minRating?: number;
  mediaType?: "all" | "movie" | "tv";
  sortBy?: "date" | "rating" | "popularity" | "title";
}

// ---------------------------------------------------------------------------
// TMDB fetch — thin wrapper that lives here so the page imports a single
// repository module for both TMDB reads and Supabase persistence.
// ---------------------------------------------------------------------------

/**
 * Fetch upcoming movies + TV from TMDB, filtered by the given params.
 *
 * Movies: discover/movie with primary_release_date.gte/lte + region.
 * TV:     discover/tv with first_air_date.gte/lte (TMDB doesn't support
 *         region filtering on TV discover, so we just filter by date).
 *
 * Both are fetched in parallel and merged. Results are sorted by date
 * ascending by default; the caller can re-sort via `sortBy`.
 */
export async function getUpcomingTitles(
  params: UpcomingQueryParams,
): Promise<TMDBTitle[]> {
  const moviePromise =
    params.mediaType === "tv"
      ? Promise.resolve([] as TMDBTitle[])
      : discoverMovies({
          primaryReleaseDateGte: params.startDate,
          primaryReleaseDateLte: params.endDate,
          withGenres: params.genres,
          voteAverageGte: params.minRating,
          sortBy: "popularity.desc",
          voteCountGte: 5,
        });

  const tvPromise =
    params.mediaType === "movie"
      ? Promise.resolve([] as TMDBTitle[])
      : discoverTv({
          firstAirDateGte: params.startDate,
          withGenres: params.genres,
          voteAverageGte: params.minRating,
          sortBy: "popularity.desc",
          voteCountGte: 5,
        });

  const [movies, tv] = await Promise.allSettled([moviePromise, tvPromise]);
  const movieList = movies.status === "fulfilled" ? movies.value : [];
  const tvList = tv.status === "fulfilled" ? tv.value : [];

  // Merge + dedupe by TMDB id (movie and TV namespaces are disjoint,
  // but we dedupe anyway in case TMDB returns the same row twice).
  const seen = new Set<number>();
  const merged: TMDBTitle[] = [];
  for (const t of [...movieList, ...tvList]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }

  // Filter out titles with no release/air date — we can't show them on
  // a calendar.
  const withDates = merged.filter((t) => {
    const d = t.release_date || t.first_air_date;
    return !!d && d >= params.startDate && d <= params.endDate;
  });

  // Default sort: date ascending. Caller can re-sort via sortBy.
  withDates.sort((a, b) => {
    const ad = a.release_date || a.first_air_date || "";
    const bd = b.release_date || b.first_air_date || "";
    return ad.localeCompare(bd);
  });

  return withDates;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Fetch the user's notifications, newest first.
 * Returns [] on any error (incl. table missing) so the UI degrades.
 */
export async function getNotifications(
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as unknown as NotificationRow[];
  } catch {
    return [];
  }
}

/**
 * Insert a new notification. Used by the reminder scheduler when a
 * release-day reminder fires, and by the watchlist "Add" action to
 * surface a confirmation in the feed.
 */
export async function insertNotification(
  row: Omit<NotificationRow, "id" | "created_at" | "is_read" | "read_at" | "sent_at"> &
    Partial<Pick<NotificationRow, "is_read" | "read_at" | "sent_at">>,
): Promise<NotificationRow | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: row.user_id,
        title: row.title,
        message: row.message,
        type: row.type,
        related_title_id: row.related_title_id,
        related_title_type: row.related_title_type,
        scheduled_for: row.scheduled_for,
        is_read: row.is_read ?? false,
      })
      .select()
      .single();
    if (error) return null;
    return data as unknown as NotificationRow;
  } catch {
    return null;
  }
}

/**
 * Mark a single notification as read (sets is_read + read_at).
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Mark all of the user's unread notifications as read.
 */
export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_read", false);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete all READ notifications for the user. Unread notifications are
 * preserved (the user might still want to act on them).
 */
export async function clearReadNotifications(userId: string): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId)
      .eq("is_read", true);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// User reminders
// ---------------------------------------------------------------------------

/**
 * Schedule a release-day reminder for a title. Inserts into user_reminders
 * (UNIQUE on user_id+tmdb_id means re-scheduling is a no-op).
 * Also inserts a notification row of type 'reminder' with scheduled_for
 * set to the release date — the Notification Center will surface it.
 */
export async function scheduleReminder(
  userId: string,
  tmdbId: string | number,
  titleType: "movie" | "series",
  releaseDate: string,
  titleName: string,
): Promise<boolean> {
  try {
    const supabase = getClient();
    const idStr = String(tmdbId);

    // 1. Upsert the reminder row. ON CONFLICT do nothing — the user
    //    already asked to be reminded.
    const { error: reminderError } = await supabase
      .from("user_reminders")
      .upsert(
        {
          user_id: userId,
          tmdb_id: idStr,
          title_type: titleType,
          release_date: releaseDate,
          is_scheduled: true,
          notification_sent: false,
        },
        { onConflict: "user_id,tmdb_id", ignoreDuplicates: true },
      );
    if (reminderError) {
      // If the error is the unique-constraint violation, that's fine —
      // the reminder already exists. Anything else → fail.
      if (!/duplicate/i.test(reminderError.message)) return false;
    }

    // 2. Insert a notification row so the user sees the scheduled
    //    reminder in their feed. We don't dedupe notifications (the
    //    user might re-toggle the bell and want a fresh row).
    await insertNotification({
      user_id: userId,
      title: `Reminder set: ${titleName}`,
      message: `We'll notify you when it releases on ${releaseDate}.`,
      type: "reminder",
      related_title_id: idStr,
      related_title_type: titleType,
      scheduled_for: new Date(releaseDate + "T09:00:00Z").toISOString(),
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel a release-day reminder. Removes the user_reminders row.
 * Does NOT remove already-inserted notifications (the user might want
 * the history).
 */
export async function cancelReminder(
  userId: string,
  tmdbId: string | number,
): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("user_reminders")
      .delete()
      .eq("user_id", userId)
      .eq("tmdb_id", String(tmdbId));
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetch all of the user's reminder rows. Used to mark the bell icon as
 * active on cards whose title the user has already subscribed to.
 */
export async function getUserReminders(
  userId: string,
): Promise<UserReminderRow[]> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", userId);
    if (error) return [];
    return (data ?? []) as unknown as UserReminderRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch any reminders whose release_date is today (or earlier) and
 * which haven't had their notification sent yet. Used by the
 * useNotifications hook on page load to fire browser notifications.
 */
export async function getDueReminders(
  userId: string,
): Promise<UserReminderRow[]> {
  try {
    const supabase = getClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", userId)
      .eq("is_scheduled", true)
      .eq("notification_sent", false)
      .lte("release_date", today);
    if (error) return [];
    return (data ?? []) as unknown as UserReminderRow[];
  } catch {
    return [];
  }
}

/**
 * Mark a reminder as notification_sent=true so we don't fire it twice.
 */
export async function markReminderSent(reminderId: string): Promise<boolean> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from("user_reminders")
      .update({ notification_sent: true })
      .eq("id", reminderId);
    return !error;
  } catch {
    return false;
  }
}
