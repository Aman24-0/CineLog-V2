// src/features/upcoming/hooks/useUpcomingData.ts
//
// useUpcomingData — fetches upcoming titles via the upcoming repository,
// groups them by relative date bucket (Today / Tomorrow / This Week /
// Later), and exposes a derived `calendarBuckets` memo for the calendar
// view (date string → list of titles).
//
// The hook owns NO state beyond the resource; all filter state is
// passed in as accessors so the page can drive it from any source
// (URL params, signals, persisted localStorage).
//
// Region reactivity: the page passes a `region` accessor (typically
// derived from `useProfileData().profile.country`). The hook feeds it
// straight into the repository's `UpcomingQueryParams.region` so a
// region change (user picks a different country in the FilterSheet, or
// the profile loads after the page mounts) triggers a fresh fetch.

import { createResource, createMemo, type Accessor } from "solid-js";
import {
  getUpcomingTitles,
  type UpcomingQueryParams,
  type UserReminderRow
} from "~/lib/supabase/repositories/upcoming";
import type { TMDBTitle } from "~/shared/types";

export type UpcomingView = "list" | "calendar";
export type UpcomingSort = "date" | "rating" | "popularity" | "title";

export interface UpcomingDataFilters {
  region: Accessor<string>;
  startDate: Accessor<string>;
  endDate: Accessor<string>;
  genres: Accessor<number[]>;
  mediaType: Accessor<"all" | "movie" | "tv">;
  sortBy: Accessor<UpcomingSort>;
}

export interface UpcomingGroup {
  key: "today" | "tomorrow" | "this_week" | "later";
  label: string;
  titles: TMDBTitle[];
}

const today = () => new Date().toISOString().slice(0, 10);

function isSameDate(d1: string, d2: string): boolean {
  return d1 === d2;
}

function startOfWeek(): string {
  const now = new Date();
  // ISO week (Monday start).
  const day = now.getDay() || 7; // 0 → 7 for Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export function useUpcomingData(
  filters: UpcomingDataFilters,
  reminders: Accessor<UserReminderRow[]>
) {
  // Build the query params memo. The createResource reads this.
  // Region defaults to "US" when the caller passes an empty string —
  // TMDB requires a 2-letter ISO 3166-1 code, and an empty region
  // makes the proxy return 422.
  const params = createMemo<UpcomingQueryParams>(() => ({
    region: filters.region() || "US",
    startDate: filters.startDate(),
    endDate: filters.endDate(),
    genres: filters.genres().length ? filters.genres() : undefined,
    mediaType: filters.mediaType(),
    sortBy: filters.sortBy()
  }));

  // Refetch whenever the params memo changes. The source function is
  // defensive: it returns [] on network error and never throws, so
  // `titlesResource.error` stays null in practice — but we still wire
  // the error accessor for the (unlikely) case where the underlying
  // fetcher throws.
  const [titlesResource] = createResource(params, (p) => getUpcomingTitles(p));

  // Sorted titles — apply the user's chosen sort on top of the date-sorted
  // list returned by the repository.
  const titles = createMemo<TMDBTitle[]>(() => {
    const list = titlesResource() ?? [];
    const sort = filters.sortBy();
    if (sort === "rating") {
      return [...list].sort(
        (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0)
      );
    }
    if (sort === "popularity") {
      return [...list].sort(
        (a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0)
      );
    }
    if (sort === "title") {
      return [...list].sort((a, b) =>
        (a.title || a.name || "").localeCompare(b.title || b.name || "")
      );
    }
    // Default: date ascending (already sorted by repository).
    return list;
  });

  // Group titles into relative buckets for the List view. For TV
  // series with a next-episode air date, we use the episode air date
  // (which is more accurate than first_air_date for ongoing series).
  const groups = createMemo<UpcomingGroup[]>(() => {
    const list = titles();
    const todayStr = today();
    const tomorrowStr = new Date(Date.now() + 86400000)
      .toISOString()
      .slice(0, 10);
    const weekStart = startOfWeek();
    const weekEnd = new Date(
      new Date(weekStart + "T00:00:00").getTime() + 6 * 86400000
    )
      .toISOString()
      .slice(0, 10);

    const buckets: Record<UpcomingGroup["key"], TMDBTitle[]> = {
      today: [],
      tomorrow: [],
      this_week: [],
      later: []
    };

    for (const t of list) {
      // Prefer the next-episode air date for TV series when present —
      // it's more accurate than first_air_date for ongoing shows.
      const dateStr =
        t.episodeAirDate || t.release_date || t.first_air_date || "";
      if (!dateStr) continue;
      if (isSameDate(dateStr, todayStr)) buckets.today.push(t);
      else if (isSameDate(dateStr, tomorrowStr)) buckets.tomorrow.push(t);
      else if (dateStr >= weekStart && dateStr <= weekEnd)
        buckets.this_week.push(t);
      else buckets.later.push(t);
    }

    return (
      [
        { key: "today", label: "Today", titles: buckets.today },
        { key: "tomorrow", label: "Tomorrow", titles: buckets.tomorrow },
        { key: "this_week", label: "This Week", titles: buckets.this_week },
        { key: "later", label: "Later", titles: buckets.later }
      ] as UpcomingGroup[]
    ).filter((g) => g.titles.length > 0);
  });

  // Calendar view: a map of YYYY-MM-DD → titles. Used by the CalendarView
  // to render dot/badges on days with releases. For TV series with a
  // next-episode air date, we bucket under the episode date.
  const calendarBuckets = createMemo<Map<string, TMDBTitle[]>>(() => {
    const map = new Map<string, TMDBTitle[]>();
    for (const t of titles()) {
      const d = t.episodeAirDate || t.release_date || t.first_air_date;
      if (!d) continue;
      const arr = map.get(d) ?? [];
      arr.push(t);
      map.set(d, arr);
    }
    return map;
  });

  // Convenience: is a title in the user's reminders? Used by cards to
  // render the bell as active.
  const reminderIds = createMemo<Set<string>>(
    () => new Set(reminders().map((r) => r.tmdb_id))
  );

  const isReminderSet = (tmdbId: string | number): boolean =>
    reminderIds().has(String(tmdbId));

  // Resource state accessors — wrapped so the return type is a clean
  // Accessor<boolean> / Accessor<Error | undefined> regardless of
  // whether the resource is currently resolved (SolidJS narrows the
  // type when the resource is Unresolved, which breaks downstream
  // consumers).
  const loading: Accessor<boolean> = () => titlesResource.loading;
  const error: Accessor<Error | undefined> = () =>
    titlesResource.error ?? undefined;

  return {
    titles,
    groups,
    calendarBuckets,
    loading,
    error,
    refetch: () => {
      // SolidJS's Resource<T> is a union type (Unresolved | Resolved),
      // and `refetch` only exists on the Resolved branch. We cast to
      // access it — the runtime method is always present.
      const r = titlesResource as unknown as { refetch?: () => void };
      try {
        r.refetch?.();
      } catch {
        // refetch() can throw when the resource is Unresolved — ignore.
      }
    },
    isReminderSet
  };
}
