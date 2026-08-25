import type { WatchlistItem } from "~/shared/types";
import { isAnimeByHeuristics } from "~/core/anime/detector";

export type ActivityAction =
  "watched" | "rated" | "added" | "completed" | "episode_watched";

export interface ActivityItem {
  id: string;
  titleId: string;
  title: string;
  posterPath: string | null | undefined;
  type: "movie" | "series" | "anime";
  action: ActivityAction;
  actionDetails?: {
    episodes?: number;
    rating?: number;
    season?: number;
    episode?: number;
  };
  timestamp: Date;
  timeAgo: string;
  source: WatchlistItem;
}

export type ActivityGroup = Record<string, ActivityItem[]>;

function addedAtDate(item: WatchlistItem): Date | null {
  if (typeof item.addedAt === "string") return parseDate(item.addedAt);
  if (item.addedAt instanceof Date)
    return parseDate(item.addedAt.toISOString());
  if (item.addedAt && typeof item.addedAt.seconds === "number") {
    return new Date(item.addedAt.seconds * 1000);
  }
  return null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Returns the latest meaningful user activity date used by the history page. */
export function getActivityDate(item: WatchlistItem): Date | null {
  if (item.media_type === "tv" && item.seasonDates) {
    const seasons = Object.entries(item.seasonDates)
      .map(([season, dates]) => ({
        season: Number(season),
        start: parseDate(dates?.start),
        end: parseDate(dates?.end)
      }))
      .filter((season) => !Number.isNaN(season.season))
      .sort((a, b) => a.season - b.season);

    for (let index = seasons.length - 1; index >= 0; index -= 1) {
      if (seasons[index].end) return seasons[index].end;
      if (seasons[index].start) return seasons[index].start;
    }
  }

  return (
    parseDate(item.watchDate) ??
    addedAtDate(item) ??
    parseDate(item.updatedAt) ??
    parseDate(item.watchProgress?.updatedAt)
  );
}

export function formatTimeAgo(date: Date, now = new Date()): string {
  const difference = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function actionFor(item: WatchlistItem): {
  action: ActivityAction;
  actionDetails?: ActivityItem["actionDetails"];
} {
  if (item.media_type === "tv" && item.watchProgress?.updatedAt) {
    return {
      action: "episode_watched",
      actionDetails: {
        episodes: 1,
        season: item.watchProgress.season ?? item.season,
        episode: item.watchProgress.episode ?? item.episode
      }
    };
  }

  if (item.status === "Completed") return { action: "completed" };
  if (item.rating && item.rating > 0) {
    return { action: "rated", actionDetails: { rating: item.rating } };
  }
  if (item.watchDate) return { action: "watched" };
  return { action: "added" };
}

export function activityType(item: WatchlistItem): ActivityItem["type"] {
  if (isAnimeByHeuristics(item)) return "anime";
  return item.media_type === "tv" ? "series" : "movie";
}

export function activityActionText(
  activity: Pick<ActivityItem, "action" | "actionDetails">
): string {
  switch (activity.action) {
    case "watched":
      return "Watched";
    case "rated":
      return `Rated ${activity.actionDetails?.rating ?? "—"}/10`;
    case "added":
      return "Added to library";
    case "completed":
      return "Completed";
    case "episode_watched": {
      const episode = activity.actionDetails?.episode;
      const season = activity.actionDetails?.season;
      if (season && episode)
        return `Watched S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
      return `Watched ${activity.actionDetails?.episodes ?? 1} episode${activity.actionDetails?.episodes === 1 ? "" : "s"}`;
    }
  }
}

export function toActivity(
  item: WatchlistItem,
  now = new Date()
): ActivityItem | null {
  const timestamp = getActivityDate(item);
  if (!timestamp) return null;
  const title = item.title ?? item.name ?? "Untitled";
  const action = actionFor(item);
  return {
    id: `${item.media_type}:${item.id}:${timestamp.getTime()}`,
    titleId: item.id,
    title,
    posterPath: item.poster_path,
    type: activityType(item),
    action: action.action,
    actionDetails: action.actionDetails,
    timestamp,
    timeAgo: formatTimeAgo(timestamp, now),
    source: item
  };
}

export function getRecentActivities(
  watchlist: WatchlistItem[] | null | undefined,
  limit = 10,
  now = new Date()
): ActivityItem[] {
  return (watchlist ?? [])
    .map((item) => toActivity(item, now))
    .filter((activity): activity is ActivityItem => activity !== null)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

export function formatDateKey(date: Date, now = new Date()): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.floor((today.getTime() - day.getTime()) / 86_400_000);

  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo <= 7) return `${daysAgo} Days Ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function groupActivitiesByDate(
  activities: ActivityItem[],
  now = new Date()
): ActivityGroup {
  return activities.reduce<ActivityGroup>((groups, activity) => {
    const key = formatDateKey(activity.timestamp, now);
    (groups[key] ??= []).push(activity);
    return groups;
  }, {});
}
